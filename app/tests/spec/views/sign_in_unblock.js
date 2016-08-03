/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

define(function (require, exports, module) {
  'use strict';

  const assert = require('chai').assert;
  const Account = require('models/account');
  const AuthErrors = require('lib/auth-errors');
  const Backbone = require('backbone');
  const BaseBroker = require('models/auth_brokers/base');
  const Constants = require('lib/constants');
  const { createRandomHexString } = require('../../lib/helpers');
  const Metrics = require('lib/metrics');
  const p = require('lib/promise');
  const Relier = require('models/reliers/relier');
  const sinon = require('sinon');
  const View = require('views/sign_in_unblock');
  const WindowMock = require('../../mocks/window');

  const UNBLOCK_CODE = createRandomHexString(Constants.UNBLOCK_CODE_LENGTH);

  describe('views/sign_in_unblock', () => {
    let account;
    let broker;
    let metrics;
    let model;
    let relier;
    let view;
    let windowMock;

    beforeEach(() => {
      metrics = new Metrics();
      windowMock = new WindowMock();

      relier = new Relier({
        window: windowMock
      });

      broker = new BaseBroker({
        relier: relier,
        window: windowMock
      });

      account = new Account({
        email: 'a@a.com',
        uid: 'uid'
      });

      sinon.stub(account, 'sendUnblockEmail', () => p());

      model = new Backbone.Model({
        account: account,
        password: 'password'
      });

      view = new View({
        broker: broker,
        canGoBack: true,
        metrics: metrics,
        model: model,
        relier: relier,
        viewName: 'sign-in-unblock',
        window: windowMock
      });

      return view.render();
    });

    afterEach(function () {
      metrics.destroy();

      view.remove();
      view.destroy();

      view = metrics = null;
    });

    describe('render', () => {
      it('renders the view, sends the unblock email', () => {
        assert.lengthOf(view.$('#fxa-signin-unblock-header'), 1);
        assert.include(view.$('.verification-email-message').text(), 'a@a.com');
        assert.equal(account.sendUnblockEmail.callCount, 1);
      });

      describe('sendUnblockEmail errors', () => {
        const unexpectedError = AuthErrors.toError('UNEXPECTED_ERROR');

        beforeEach(() => {
          account.sendUnblockEmail.restore();
          sinon.stub(account, 'sendUnblockEmail',
              () => p.reject(unexpectedError));

          return view.render();
        });

        it('displays the error, user is unable to enter code', () => {
          const $errorEl = view.$('.error');
          assert.lengthOf($errorEl, 1);
          assert.include($errorEl.text().toLowerCase(), 'unexpected');

          assert.lengthOf(view.$('#error_code'), 0);
        });
      });

      describe('without an account', () => {
        beforeEach(() => {
          model.unset('account');
          sinon.stub(view, 'navigate', () => {});

          return view.render();
        });

        it('redirects to the signin page', () => {
          assert.isTrue(view.navigate.calledWith('signin'));
        });
      });
    });

    describe('resend', () => {
      beforeEach(() => {
        return view.resend();
      });

      it('delegate to the account', () => {
        assert.isTrue(account.sendUnblockEmail.called);
      });
    });

    describe('validateAndSubmit', () => {
      beforeEach(() => {
        sinon.stub(view, 'submit', () => p());
        sinon.spy(view, 'showValidationError');
      });

      describe('with an empty code', () => {
        beforeEach(() => {
          view.$('#unblock_code').val('');
          return view.validateAndSubmit();
        });

        it('displays a tooltip, does not call submit', () => {
          assert.isTrue(view.showValidationError.called);
          assert.isFalse(view.submit.called);
        });
      });

      describe('with an invalid code', () => {
        beforeEach(() => {
          view.$('#unblock_code').val('1');
          return view.validateAndSubmit();
        });

        it('displays a tooltip, does not call submit', () => {
          assert.isTrue(view.showValidationError.called);
          assert.isFalse(view.submit.called);
        });
      });

      describe('with a valid code', () => {
        beforeEach(() => {
          view.$('#unblock_code').val(UNBLOCK_CODE);
          view.enableSubmitIfValid();
          return view.validateAndSubmit();
        });

        it('calls submit', () => {
          assert.isTrue(view.submit.called);
        });
      });
    });

    describe('submit', () => {
      describe('success', () => {
        beforeEach(() => {
          sinon.stub(view, 'signIn', () => p());

          view.$('#unblock_code').val(UNBLOCK_CODE);

          return view.submit();
        });

        it('delegates to view.signIn, with the `password` and `unblockCode`', () => {
          assert.isTrue(view.signIn.calledWith(account, 'password', UNBLOCK_CODE));
        });
      });

      describe('incorrect password', () => {
        const incorrectPasswordError =
          AuthErrors.toError('INCORRECT_PASSWORD');

        beforeEach(() => {
          sinon.stub(view, 'signIn',
             () => p.reject(incorrectPasswordError));

          sinon.stub(view, 'navigate', () => p());

          view.$('#unblock_code').val(UNBLOCK_CODE);

          return view.submit();
        });

        it('redirects to `signin` with the account `email` and error', () => {
          assert.isTrue(view.navigate.calledWith('signin', {
            email: account.get('email'),
            error: incorrectPasswordError
          }));
        });
      });

      describe('other errors', () => {
        const unexpectedError = AuthErrors.toError('UNEXPECTED_ERROR');
        let receivedError;

        beforeEach(() => {
          sinon.stub(view, 'signIn',
             () => p.reject(unexpectedError));

          sinon.stub(view, 'navigate', () => p());

          view.$('#unblock_code').val(UNBLOCK_CODE);

          return view.submit()
            .then(assert.fail, (err) => receivedError = err);
        });

        it('rejects with the error for display at a lower level', () => {
          assert.isTrue(AuthErrors.is(receivedError, 'UNEXPECTED_ERROR'));
        });
      });
    });
  });
});

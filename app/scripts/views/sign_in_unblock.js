/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

define(function (require, exports, module) {
  'use strict';

  const AuthErrors = require('lib/auth-errors');
  const Cocktail = require('cocktail');
  const Constants = require('lib/constants');
  const FormView = require('views/form');
  const ResendMixin = require('views/mixins/resend-mixin');
  const ResumeTokenMixin = require('views/mixins/resume-token-mixin');
  const SignInMixin = require('views/mixins/signin-mixin');
  const Template = require('stache!templates/sign_in_unblock');

  const proto = FormView.prototype;
  const View = FormView.extend({
    template: Template,
    className: 'sign-in-unblock',

    getAccount () {
      return this.model.get('account');
    },

    beforeRender () {
      if (! this.model.get('account')) {
        this.navigate('signin');
        return false;
      }

      return this._sendUnblockEmail()
        .then(proto.beforeRender.call(this))
        .fail(err => this.model.set('error', err));
    },

    context () {
      const email = this.getAccount().get('email');

      return {
        email,
        error: this.model.get('error'),
        unblockCodeLength: Constants.UNBLOCK_CODE_LENGTH
      };
    },

    submit () {
      const account = this.getAccount();
      const password = this.model.get('password');
      const unblockCode = this.getElementValue('#unblock_code');

      return this.signIn(account, password, unblockCode)
        .fail((err) => this.onSignInError(account, password, err));
    },

    onSignInError (account, password, err) {
      if (AuthErrors.is(err, 'INCORRECT_PASSWORD')) {
        // The user must go enter the correct password this time.
        this.navigate('signin', {
          email: account.get('email'),
          error: err
        });
      } else {
        // re-throw, it'll be displayed at a lower level.
        throw err;
      }
    },

    resend () {
      return this._sendUnblockEmail();
    },

    _sendUnblockEmail () {
      return this.getAccount().sendUnblockEmail();
    }
  });

  Cocktail.mixin(
    View,
    ResendMixin,
    ResumeTokenMixin,
    SignInMixin
  );

  module.exports = View;
});

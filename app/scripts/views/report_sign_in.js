/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

define(function (require, exports, module) {
  'use strict';

  const AuthErrors = require('lib/auth-errors');
  const FormView = require('views/form');
  const Template = require('stache!templates/report_sign_in');
  const VerificationInfo = require('models/verification/report-sign-in');

  const View = FormView.extend({
    className: 'report-sign-in',
    template: Template,

    initialize () {
      this._verificationInfo = new VerificationInfo(this.getSearchParams());
    },

    beforeRender () {
      if (! this._verificationInfo.isValid()) {
        this.logError(AuthErrors.toError('DAMAGED_REJECT_UNBLOCK_LINK'));
      }
    },

    submit () {
      const verificationInfo = this._verificationInfo;
      const account = this.user.initAccount({
        uid: verificationInfo.get('uid')
      });
      const unblockCode = verificationInfo.get('unblockCode');

      return this.user.rejectAccountUnblockCode(account, unblockCode)
        .then(() => this.navigate('signin_reported'));
    },

    context () {
      const verificationInfo = this._verificationInfo;

      const isLinkDamaged = ! verificationInfo.isValid();
      const isLinkValid = ! isLinkDamaged;

      return {
        isLinkDamaged,
        isLinkValid
      };
    }
  });

  module.exports = View;
});


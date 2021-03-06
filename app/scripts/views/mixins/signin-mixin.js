/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Shared implementation of `signIn` view method

define(function (require, exports, module) {
  'use strict';

  var AuthErrors = require('lib/auth-errors');
  var p = require('lib/promise');
  var VerificationMethods = require('lib/verification-methods');
  var VerificationReasons = require('lib/verification-reasons');

  module.exports = {
    // force auth extends a view with this mixin
    // for metrics purposes we need to know the view submit context
    signInSubmitContext: 'signin',
    events: {
      'click': '_engageSignInForm',
      'input input': '_engageSignInForm'
    },
    /**
     * Sign in a user
     *
     * @param {Account} account
     *     @param {String} account.sessionToken
     *     Session token from the account
     * @param {String} [password] - the user's password. Can be null if
     *  user is signing in with a sessionToken.
     * @return {Object} promise
     */
    signIn: function (account, password) {
      var self = this;
      self.logEvent(`flow.${this.signInSubmitContext}.submit`);

      if (! account ||
            account.isDefault() ||
            (! account.has('sessionToken') && ! password)) {
        return p.reject(AuthErrors.toError('UNEXPECTED_ERROR'));
      }

      return self.invokeBrokerMethod('beforeSignIn', account)
        .then(function () {
          return self.user.signInAccount(account, password, self.relier, {
            // a resume token is passed in to allow
            // unverified account or session users to complete
            // email verification.
            resume: self.getStringifiedResumeToken()
          });
        })
        .then(function (account) {
          if (self._formPrefill) {
            self._formPrefill.clear();
          }

          if (self.relier.accountNeedsPermissions(account)) {
            return self.navigate('signin_permissions', {
              account: account,
              // the permissions screen will call onSubmitComplete
              // with an updated account
              onSubmitComplete: self.onSignInSuccess.bind(self)
            });
          }

          return self.onSignInSuccess(account);
        });
    },

    onSignInSuccess: function (account) {
      if (! account.get('verified')) {
        var verificationMethod = account.get('verificationMethod');
        var verificationReason = account.get('verificationReason');

        if (verificationReason === VerificationReasons.SIGN_IN &&
            verificationMethod === VerificationMethods.EMAIL) {
          return this.navigate('confirm_signin', {
            account: account,
            flow: this.flow
          });
        } else {
          return this.navigate('confirm', {
            account: account,
            flow: this.flow
          });
        }
      }

      // If the account's uid changed, update the relier model or else
      // the user can end up in a permanent "Session Expired" state
      // when signing into Sync via force_auth. This occurs because
      // Sync opens force_auth with a uid. The uid could have changed. We
      // sign the user in here with the new uid, then attempt to do
      // other operations with the old uid. Not all brokers support
      // uid changes, so only make the update if the broker supports
      // the change. See #3057 and #3283
      if (account.get('uid') !== this.relier.get('uid') &&
          this.broker.hasCapability('allowUidChange')) {
        this.relier.set('uid', account.get('uid'));
      }

      this.logViewEvent('success');
      this.logViewEvent('signin.success');

      var brokerMethod = this.afterSignInBrokerMethod || 'afterSignIn';
      var navigateData = this.afterSignInNavigateData || {};

      return this.invokeBrokerMethod(brokerMethod, account)
        .then(this.navigate.bind(this, this.model.get('redirectTo') || 'settings', {}, navigateData));
    },

    _engageSignInForm (event) {
      if (event && event.target) {
        var target = this.$el.find(event.target).attr('id');

        if (target === 'have-account') {
          // if the user clicks on 'have-account' we count that as flow event instead of the 'engage' event.
          // Details: https://github.com/mozilla/fxa-content-server/pull/4221
          this.logEvent('flow.have-account');
          return;
        }
      }

      // user has engaged with the sign in, sign up or force auth form
      // the flow event will be different depending on the view name
      this.logEventOnce(`flow.${this.viewName}.engage`);
    }
  };
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * A broker that knows how to finish an OAuth flow. Should be subclassed
 * to override `sendOAuthResultToRelier`
 */

define(function (require, exports, module) {
  'use strict';

  var _ = require('underscore');
  var AuthErrors = require('lib/auth-errors');
  var BaseAuthenticationBroker = require('models/auth_brokers/base');
  var Constants = require('lib/constants');
  var HaltBehavior = require('views/behaviors/halt');
  var OAuthErrors = require('lib/oauth-errors');
  var p = require('lib/promise');
  var Url = require('lib/url');
  var Validate = require('lib/validate');

  /**
   * Formats the OAuth "result.redirect" url into a {code, state} object
   *
   * @param {Object} result
   * @returns {Object}
   */
  function _formatOAuthResult(result) {

    // get code and state from redirect params
    if (! result) {
      return p.reject(OAuthErrors.toError('INVALID_RESULT'));
    } else if (! result.redirect) {
      return p.reject(OAuthErrors.toError('INVALID_RESULT_REDIRECT'));
    }

    var redirectParams = result.redirect.split('?')[1];

    result.state = Url.searchParam('state', redirectParams);
    result.code = Url.searchParam('code', redirectParams);

    if (! Validate.isOAuthCodeValid(result.code)) {
      return p.reject(OAuthErrors.toError('INVALID_RESULT_CODE'));
    }

    return p(result);
  }

  var proto = BaseAuthenticationBroker.prototype;

  var OAuthAuthenticationBroker = BaseAuthenticationBroker.extend({
    type: 'oauth',

    defaultBehaviors: _.extend({}, proto.defaultBehaviors, {
      // the relier will take over after sign in, no need to transition.
      afterForceAuth: new HaltBehavior(),
      afterSignIn: new HaltBehavior(),
      afterSignInConfirmationPoll: new HaltBehavior()
    }),

    defaultCapabilities: _.extend({}, proto.defaultCapabilities, {
      // Disable signed-in notifications for OAuth due to the potential for
      // unintended consequences from redirecting to a relier URL more than
      // once.
      handleSignedInNotification: false
    }),

    initialize: function (options) {
      options = options || {};

      this.session = options.session;
      this._assertionLibrary = options.assertionLibrary;
      this._oAuthClient = options.oAuthClient;

      return BaseAuthenticationBroker.prototype.initialize.call(
                  this, options);
    },

    getOAuthResult: function (account) {
      var self = this;
      if (! account || ! account.get('sessionToken')) {
        return p.reject(AuthErrors.toError('INVALID_TOKEN'));
      }

      return self._assertionLibrary.generate(account.get('sessionToken'))
        .then(function (assertion) {
          var relier = self.relier;
          var oauthParams = {
            assertion: assertion,
            client_id: relier.get('clientId'), //eslint-disable-line camelcase
            scope: relier.get('scope'),
            state: relier.get('state')
          };
          if (relier.get('accessType') === Constants.ACCESS_TYPE_OFFLINE) {
            oauthParams.access_type = Constants.ACCESS_TYPE_OFFLINE; //eslint-disable-line camelcase
          }
          return self._oAuthClient.getCode(oauthParams);
        })
        .then(_formatOAuthResult);
    },

    /**
     * Overridden by subclasses to provide a strategy to finish the OAuth flow.
     *
     * @param {Object} [result] - state sent by OAuth RP
     * @param {String} [result.state] - state sent by OAuth RP
     * @param {String} [result.code] - OAuth code generated by the OAuth server
     * @param {String} [result.redirect] - URL that can be used to redirect to
     * the RP.
     *
     * @returns {Promise}
     */
    sendOAuthResultToRelier: function (/*result*/) {
      return p.reject(new Error('subclasses must override sendOAuthResultToRelier'));
    },

    finishOAuthSignInFlow: function (account) {
      return this.finishOAuthFlow(account, { action: Constants.OAUTH_ACTION_SIGNIN });
    },

    finishOAuthSignUpFlow: function (account) {
      return this.finishOAuthFlow(account, { action: Constants.OAUTH_ACTION_SIGNUP });
    },

    finishOAuthFlow: function (account, additionalResultData = {}) {
      this.session.clear('oauth');
      return this.getOAuthResult(account)
        .then((result) => {
          result = _.extend(result, additionalResultData);
          return this.sendOAuthResultToRelier(result);
        });
    },

    persistVerificationData: function (account) {
      return p().then(() => {
        var relier = this.relier;
        this.session.set('oauth', {
          access_type: relier.get('access_type'), //eslint-disable-line camelcase
          action: relier.get('action'),
          client_id: relier.get('clientId'), //eslint-disable-line camelcase
          keys: relier.get('keys'),
          scope: relier.get('scope'),
          state: relier.get('state')
        });

        return proto.persistVerificationData.call(this, account);
      });
    },

    afterForceAuth: function (account) {
      return this.finishOAuthSignInFlow(account)
        .then(() => {
          return proto.afterForceAuth.call(this, account);
        });
    },

    afterSignIn: function (account) {
      return this.finishOAuthSignInFlow(account)
        .then(() => {
          return proto.afterSignIn.call(this, account);
        });
    },

    afterSignInConfirmationPoll (account) {
      return this.finishOAuthSignInFlow(account)
        .then(() => {
          return proto.afterSignInConfirmationPoll.call(this, account);
        });
    },

    afterSignUpConfirmationPoll: function (account) {
      // The original tab always finishes the OAuth flow if it is still open.
      return this.finishOAuthSignUpFlow(account);
    },

    afterResetPasswordConfirmationPoll: function (account) {
      return this.finishOAuthSignInFlow(account);
    },

    transformLink: function (link) {
      if (link[0] !== '/') {
        link = '/' + link;
      }

      return '/oauth' + link;
    }
  });

  module.exports = OAuthAuthenticationBroker;
});

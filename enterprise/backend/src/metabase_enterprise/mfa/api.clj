(ns metabase-enterprise.mfa.api
  "/api/ee/mfa/ endpoints.

  `POST /verify` is reachable without a session (the caller is mid-login) and is mounted without a
  premium-feature gate: verification is enforcement, and enforcement must keep working through a
  license lapse."
  (:require
   [java-time.api :as t]
   [metabase-enterprise.mfa.challenge :as challenge]
   [metabase-enterprise.mfa.enrollment :as enrollment]
   [metabase.api.macros :as api.macros]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.channel.email :as channel.email]
   [metabase.channel.settings :as channel.settings]
   [metabase.config.core :as config]
   [metabase.events.core :as events]
   [metabase.request.core :as request]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.malli.schema :as ms]
   [throttle.core :as throttle]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private verify-throttlers
  ;; Codes are 6 digits, so slow brute-force limits are load-bearing.
  {:user-id    (throttle/make-throttler :user-id, :attempts-threshold 5)
   :ip-address (throttle/make-throttler :ip-address, :attempts-threshold 50)})

(def ^:private email-otp-send-throttler
  ;; sending is expensive and spammable — much tighter than verification
  (throttle/make-throttler :user-id, :attempts-threshold 3))

(def ^:private throttling-disabled? (config/config-bool :mb-disable-session-throttle))

(defn- throttle-check [throttler throttle-key]
  (when-not throttling-disabled?
    (throttle/check throttler throttle-key)))

(defn- invalid-token-ex []
  (ex-info (str (deferred-tru "Authentication session expired. Please log in again."))
           {:status-code 401}))

;; No response schema: the success path returns a full ring response (session cookies must be set),
;; which the response-schema machinery would validate as the body. Same constraint as
;; `POST /api/session`. Body shape: `{:id <session-key>}`.
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/verify"
  "Complete a two-step login by verifying a one-time code. Takes the `mfa_token` returned by
  `POST /api/session` and either the 6-digit `code` from the user's authenticator app or one of
  their single-use recovery codes; on success sets the session cookie."
  [_route-params
   _query-params
   {:keys [mfa_token code]} :- [:map
                                [:mfa_token ms/NonBlankString]
                                [:code      ms/NonBlankString]]
   request]
  (let [request-time (t/zoned-date-time (t/zone-id "GMT"))
        claims       (or (challenge/verify-challenge-token mfa_token)
                         (throw (invalid-token-ex)))
        {:keys [jti]} claims
        user-id      (:user-id claims)
        first-factor (auth-identity/provider-string->keyword (:provider claims))]
    (when-not jti
      (throw (invalid-token-ex)))
    (throttle-check (verify-throttlers :ip-address) (request/ip-address request))
    (throttle-check (verify-throttlers :user-id) user-id)
    (if (enrollment/verify-attempt! user-id code jti)
      (let [user     (t2/select-one [:model/User :id :is_active :last_login :tenant_id] :id user-id)
            session  (auth-identity/create-session-with-auth-tracking! user (request/device-info request) first-factor)
            response (vary-meta {:id (str (:key session))} assoc :metabase-user-id (:user_id session))]
        (request/set-session-cookies request response session request-time))
      (do
        (events/publish-event! :event/mfa-verification-failed
                               {:object (t2/select-one :model/User :id user-id)})
        (throw (ex-info (str (deferred-tru "Invalid authentication code."))
                        {:status-code 401}))))))

(api.macros/defendpoint :post "/send-email-otp" :- [:map [:success [:= true]]]
  "Email a one-time code as a fallback second factor (for a user who lost their authenticator but
  still has recovery codes disabled or unavailable). Requires a valid challenge token from
  `POST /api/session`; the code is single-use with a 10-minute expiry and is accepted by
  `POST /verify` like any other code."
  [_route-params
   _query-params
   {:keys [mfa_token]} :- [:map [:mfa_token ms/NonBlankString]]]
  (let [claims  (or (challenge/verify-challenge-token mfa_token)
                    (throw (invalid-token-ex)))
        user-id (:user-id claims)]
    (throttle-check email-otp-send-throttler user-id)
    (when-not (channel.settings/email-configured?)
      (throw (ex-info (str (deferred-tru "Email is not configured on this instance."))
                      {:status-code 400})))
    (let [code  (or (enrollment/set-email-otp! user-id)
                    (throw (invalid-token-ex)))
          email (t2/select-one-fn :email :model/User :id user-id)]
      (channel.email/send-message!
       {:subject      (tru "Your Metabase sign-in code")
        :recipients   [email]
        :message-type :text
        :message      (str (tru "Your one-time sign-in code is: {0}" code)
                           "\n\n"
                           (tru "It expires in 10 minutes. If you didn''t try to sign in, contact your administrator."))})
      {:success true})))

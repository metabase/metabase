(ns metabase-enterprise.mfa.api
  "/api/ee/mfa/ endpoints.

  `POST /verify` is reachable without a session (the caller is mid-login) and is mounted without a
  premium-feature gate: verification is enforcement, and enforcement must keep working through a
  license lapse."
  (:require
   [java-time.api :as t]
   [metabase-enterprise.mfa.challenge :as challenge]
   [metabase-enterprise.mfa.enrollment :as enrollment]
   [metabase-enterprise.mfa.throttling :as mfa.throttling]
   [metabase.api.macros :as api.macros]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.channel.email :as email]
   [metabase.channel.settings :as channel.settings]
   [metabase.events.core :as events]
   [metabase.request.core :as request]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [throttle.core :as throttle]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private verify-throttlers
  ;; Codes are 6 digits, so brute-force limits are load-bearing. Only failures count (see
  ;; `mfa.throttling`), so 5 wrong codes per user per hour, not 5 logins.
  {:user-id    (throttle/make-throttler :user-id, :attempts-threshold 5)
   :ip-address (throttle/make-throttler :ip-address, :attempts-threshold 50)})

(def ^:private email-otp-send-throttlers
  ;; sending is expensive and spammable — every send counts, much tighter than verification
  {:user-id    (throttle/make-throttler :user-id, :attempts-threshold 3)
   :ip-address (throttle/make-throttler :ip-address, :attempts-threshold 20)})

(defn- invalid-token-ex []
  (ex-info (tru "Authentication session expired. Please log in again.")
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
   ;; `:remember` is not bound here but is part of the contract: `request/set-session-cookies`
   ;; reads it from the raw body to decide session-vs-permanent cookie, exactly as on
   ;; `POST /api/session` — for MFA users THIS request is the one that creates the session.
   {mfa-token :mfa_token, code :code} :- [:map
                                          [:mfa_token ms/NonBlankString]
                                          [:code      ms/NonBlankString]
                                          [:remember  {:optional true} :boolean]]
   request]
  (let [request-time (t/zoned-date-time (t/zone-id "GMT"))
        claims       (or (challenge/verify-challenge-token mfa-token)
                         (throw (invalid-token-ex)))
        {:keys [jti]} claims
        user-id      (:user-id claims)
        first-factor (auth-identity/provider-string->keyword (:provider claims))]
    (when-not jti
      (throw (invalid-token-ex)))
    (mfa.throttling/call-with-failure-throttling
     [[(verify-throttlers :ip-address) (request/ip-address request)]
      [(verify-throttlers :user-id) user-id]]
     (fn []
       (if (enrollment/verify-attempt! user-id code jti)
         (let [user (t2/select-one [:model/User :id :is_active :last_login :tenant_id] :id user-id)]
           ;; the account can be deactivated (or deleted) between the password step and here; a
           ;; challenge token must not outlive the account. Same 401 as a bad token — no oracle.
           (when-not (:is_active user)
             (throw (invalid-token-ex)))
           (let [session  (auth-identity/create-session-with-auth-tracking! user (request/device-info request) first-factor)
                 response (vary-meta {:id (str (:key session))} assoc :metabase-user-id (:user_id session))]
             (request/set-session-cookies request response session request-time)))
         (do
           (events/publish-event! :event/mfa-verification-failed
                                  {:object (t2/select-one :model/User :id user-id)})
           (throw (ex-info (tru "Invalid authentication code.")
                           {:status-code 401}))))))))

(api.macros/defendpoint :post "/send-email-otp" :- [:map [:success [:= true]]]
  "Email a one-time code as a fallback second factor (for a user who lost their authenticator but
  still has recovery codes disabled or unavailable). Requires a valid challenge token from
  `POST /api/session`; the code is single-use with a 10-minute expiry and is accepted by
  `POST /verify` like any other code."
  [_route-params
   _query-params
   {mfa-token :mfa_token} :- [:map [:mfa_token ms/NonBlankString]]
   request]
  (let [claims  (or (challenge/verify-challenge-token mfa-token)
                    (throw (invalid-token-ex)))
        {:keys [jti]} claims
        user-id (:user-id claims)]
    ;; a token that already minted a session must not keep sending codes for its remaining TTL
    (when (or (not jti) (enrollment/jti-consumed? user-id jti))
      (throw (invalid-token-ex)))
    (mfa.throttling/check (email-otp-send-throttlers :ip-address) (request/ip-address request))
    (mfa.throttling/check (email-otp-send-throttlers :user-id) user-id)
    (when-not (channel.settings/email-configured?)
      (throw (ex-info (tru "Email is not configured on this instance.")
                      {:status-code 400})))
    (let [code       (or (enrollment/set-email-otp! user-id)
                         (throw (invalid-token-ex)))
          user-email (t2/select-one-fn :email :model/User :id user-id)]
      (try
        (email/send-message-or-throw!
         {:subject      (tru "Your Metabase sign-in code")
          :recipients   [user-email]
          :message-type :text
          :message      (str (tru "Your one-time sign-in code is: {0}" code)
                             "\n\n"
                             (tru "It expires in 10 minutes. If you didn''t try to sign in, contact your administrator."))})
        (catch Throwable e
          (log/warn e "Failed to send MFA email OTP")
          ;; don't tell an unauthenticated caller "the code exists but the email failed"
          (throw (ex-info (tru "Failed to send the sign-in code. Please try again or contact your administrator.")
                          {:status-code 500}))))
      {:success true})))

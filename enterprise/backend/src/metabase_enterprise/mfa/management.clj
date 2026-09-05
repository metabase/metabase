(ns metabase-enterprise.mfa.management
  "/api/ee/mfa endpoints that require a signed-in user (mounted behind auth in
  `metabase-enterprise.mfa.routes`).

  Feature gating follows the fail-closed license-lapse split: *starting* an enrollment requires
  the `:multi-factor-auth` feature (setup), while disable, status, and recovery-code regeneration
  never do — a lapsed license must not strand an enrolled user.

  Re-auth model: enroll with the factor you have (your password — local hash for password users,
  LDAP bind for LDAP users); disable/regenerate with the factor you're managing (a fresh TOTP or
  recovery code), so a stolen password alone can never remove or weaken 2FA."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.mfa.db :as mfa.db]
   [metabase-enterprise.mfa.enrollment :as enrollment]
   [metabase-enterprise.mfa.settings :as mfa.settings]
   [metabase-enterprise.mfa.throttling :as mfa.throttling]
   [metabase-enterprise.mfa.verification :as verification]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.channel.email.messages :as messages]
   [metabase.events.core :as events]
   [metabase.premium-features.core :as premium-features]
   [metabase.request.core :as request]
   [metabase.sso.core :as sso]
   [metabase.util.encryption :as encryption]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [metabase.util.password :as u.password]
   [throttle.core :as throttle]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Helpers --------------------------------------------------

(def ^:private throttlers
  ;; second-factor re-auth takes a 6-digit code, so these paths need brute-force limits like
  ;; /verify. Only failed attempts count (see `mfa.throttling`).
  {:enroll     (throttle/make-throttler :user-id, :attempts-threshold 5)
   :regenerate (throttle/make-throttler :user-id, :attempts-threshold 5)
   :disable    (throttle/make-throttler :user-id, :attempts-threshold 5)})

(defn- throttled [throttler-key f]
  (mfa.throttling/call-with-failure-throttling
   [[(throttlers throttler-key) api/*current-user-id*]]
   f))

(premium-features/defenterprise reset-mfa-throttlers-for-testing!
  "EE implementation: clear the accumulated state of the MFA management throttlers
  (enroll/disable/regenerate). Only for the testing API — see [[metabase.testing-api.api]]."
  :feature :none
  []
  (doseq [throttler (vals throttlers)]
    (reset! (:attempts throttler) nil)))

(defn- verify-user-password
  "Re-verify the signed-in user's first-factor password, dispatched by how they authenticate:
  against the local hash for password users, by LDAP bind for LDAP-only users.

  Rejects blank passwords itself rather than trusting callers' schemas: an empty password sent to
  `ldap/bind?` is an *anonymous bind*, which succeeds on directories that allow it."
  [user-id password]
  (boolean
   (when-not (str/blank? password)
     (or (when-let [{:keys [password_hash password_salt]}
                    (mfa.db/password-credentials user-id)]
           (and password_hash (u.password/verify-password password password_salt password_hash)))
         (when (sso/ldap-enabled)
           ;; an unreachable directory fails closed: re-auth is denied (the user retries when the
           ;; directory is back; admin/remove needs no re-auth), never an unhandled 500
           (try
             (when-let [user-email (mfa.db/user-email user-id)]
               (when-let [user-info (sso/find-user user-email)]
                 (sso/verify-password user-info password)))
             (catch Exception e
               (log/warnf "LDAP re-auth failed because the directory is unreachable: %s" (ex-message e))
               false)))))))

;; Notification emails here are fire-and-log by construction: the messages/send-mfa-*-email!
;; senders route through email/send-message!, which catches and logs delivery failures — so an
;; unreachable SMTP server never fails an operation that has already committed.

(defn- invalid-code-ex []
  (ex-info (tru "Invalid authentication code.") {:status-code 400}))

;;; -------------------------------------------------- Enrollment --------------------------------------------------

(api.macros/defendpoint :post "/enroll" :- [:map
                                            [:secret      ms/NonBlankString]
                                            [:otpauth_uri ms/NonBlankString]]
  "Start TOTP enrollment for the current user. Requires the account password (LDAP users re-bind
  against the directory) and the `:multi-factor-auth` feature. Returns the Base32 `secret` and an
  `otpauth_uri` for QR display; enrollment is not active until confirmed with a live code."
  [_route-params
   _query-params
   {:keys [password]} :- [:map [:password ms/NonBlankString]]]
  (premium-features/assert-has-feature :multi-factor-auth (tru "Multi-factor authentication"))
  (when-not (mfa.settings/mfa-enabled?)
    (throw (ex-info (tru "Two-factor authentication is not enabled on this instance.")
                    {:status-code 400})))
  (throttled :enroll
             (fn []
               (when-not (verify-user-password api/*current-user-id* password)
                 ;; 400, not 401: the session is fine, the re-auth input is wrong. The FE (and any
                 ;; well-behaved client) treats a 401 as an expired session and bounces to login.
                 (throw (ex-info (tru "Invalid password.")
                                 {:status-code 400
                                  :errors      {:password (tru "Invalid password.")}})))
               ;; Precondition for [[enrollment/start-enrollment!]] is met: this user is logged in and we just
               ;; re-validated their password.
               (or (enrollment/start-enrollment! api/*current-user-id*)
                   (throw (ex-info (tru "Two-factor authentication is already set up. Disable it before re-enrolling.")
                                   {:status-code 400}))))))

(api.macros/defendpoint :post "/enroll/confirm" :- [:map
                                                    [:recovery_codes [:sequential ms/NonBlankString]]]
  "Confirm TOTP enrollment by verifying a code from the authenticator app. Activates the second
  factor and returns the single-use recovery codes — the only time they exist in plaintext."
  [_route-params
   _query-params
   {:keys [code]} :- [:map [:code ms/NonBlankString]]]
  (premium-features/assert-has-feature :multi-factor-auth (tru "Multi-factor authentication"))
  (let [{:keys [recovery-codes]} (throttled :enroll
                                            (fn []
                                              (or (enrollment/confirm-enrollment! api/*current-user-id* code)
                                                  (throw (invalid-code-ex)))))
        user  (mfa.db/user api/*current-user-id*)]
    (messages/send-mfa-enabled-email! (:email user))
    (events/publish-event! :event/mfa-enrolled {:object user})
    {:recovery_codes recovery-codes}))

(api.macros/defendpoint :post "/disable" :- nil
  "Disable two-factor authentication for the current user. Re-auth is a fresh second factor — a
  TOTP code or an unused recovery code — never just the password."
  [_route-params
   _query-params
   {:keys [code]} :- [:map [:code ms/NonBlankString]]]
  (throttled :disable
             (fn []
               ;; one transaction so a consumed recovery code and the enrollment removal land together
               (t2/with-transaction [_conn]
                 (when-not (verification/verify-attempt! api/*current-user-id* code nil)
                   (throw (invalid-code-ex)))
                 (enrollment/disable! api/*current-user-id*))))
  (let [user (mfa.db/user api/*current-user-id*)]
    (messages/send-mfa-disabled-email! (:email user))
    (events/publish-event! :event/mfa-disabled {:object user}))
  api/generic-204-no-content)

(api.macros/defendpoint :get "/status" :- [:map
                                           [:mfa_enabled              :boolean]
                                           [:enrolled                 :boolean]
                                           [:pending                  :boolean]
                                           [:method                   [:maybe :string]]
                                           [:recovery_codes_remaining :int]]
  "The current user's MFA status, for the account-settings UI."
  []
  (let [user-id api/*current-user-id*
        method  (enrollment/enrolled-method user-id)]
    {:mfa_enabled              (mfa.settings/mfa-enabled?)
     :enrolled                 (boolean method)
     :pending                  (enrollment/pending? user-id)
     :method                   (some-> method name)
     :recovery_codes_remaining (enrollment/recovery-codes-remaining user-id)}))

;;; -------------------------------------------------- Admin --------------------------------------------------

(api.macros/defendpoint :post "/admin/remove" :- nil
  "Admin: remove *another* user's two-factor enrollment entirely — the lockout escape hatch for a
  lost authenticator with no recovery codes. Never feature-gated (a lapsed license must not make
  lockouts permanent). The affected user is notified by email. They re-enroll from scratch — there
  is nothing to \"reset\", the secret lives on their device.

  Removing your *own* enrollment is deliberately refused here: this is a user-management endpoint
  that takes no second factor (the target can't produce one — that's why an admin is removing it),
  and the admin UI never collects a code. Self-removal goes through the normal Security page, which
  re-auths with a fresh factor via `/disable`. Without this guard a hijacked admin session could
  strip its own 2FA with only a cookie, turning transient access into a permanent password bypass."
  [_route-params
   _query-params
   {user-id :user_id} :- [:map [:user_id ms/PositiveInt]]]
  (api/check-superuser)
  (when (= user-id api/*current-user-id*)
    (throw (ex-info (tru "You cannot administratively remove your own two-factor authentication. Please use the normal removal method in your account settings.")
                    {:status-code 400})))
  (when (enrollment/disable! user-id)
    (let [user (mfa.db/user user-id)]
      (messages/send-mfa-removed-by-admin-email! (:email user))
      (events/publish-event! :event/mfa-disabled {:object user})))
  api/generic-204-no-content)

(api.macros/defendpoint :get "/admin/overview" :- [:map
                                                   [:encryption_key_set :boolean]
                                                   [:enrolled_count     :int]
                                                   [:unenrolled_count   :int]]
  "Admin: enrollment overview — how many users have (and haven't) set up a second factor, and
  whether the instance encrypts secrets at rest."
  []
  (api/check-superuser)
  {:encryption_key_set (encryption/default-encryption-enabled?)
   :enrolled_count     (mfa.db/confirmed-totp-count)
   :unenrolled_count   (mfa.db/unenrolled-user-count)})

;;; -------------------------------------------------- Admin user lists --------------------------------------------------

(defn- user-list-response
  "Name-ordered, offset-paged list of enrolled or unenrolled users matching the name or email `query`, in the
  standard {:data :total :limit :offset} envelope."
  [enrolled? query]
  {:data   (mfa.db/user-list enrolled?
                             query
                             ;; (request/limit) is nil on an unpaged request
                             (when (request/paged?) (request/limit))
                             (when (request/paged?) (request/offset)))
   :total  (mfa.db/user-list-count enrolled? query)
   :limit  (request/limit)
   :offset (request/offset)})

(def ^:private admin-mfa-user-entries
  [[:id           ms/PositiveInt]
   [:email        ms/NonBlankString]
   [:first_name   [:maybe :string]]
   [:last_name    [:maybe :string]]
   [:common_name  :string]
   [:sso_source   [:maybe :keyword]]
   [:is_active    :boolean]
   [:is_superuser :boolean]])

(defn- paged-schema [row]
  [:map {:closed true}
   [:data   [:sequential row]]
   [:total  :int]
   [:limit  [:maybe :int]]
   [:offset [:maybe :int]]])

;; closed so the secret-bearing `credentials` column can never be added to these responses by accident
(def ^:private EnrolledUsersResponse
  (-> (into [:map {:closed true}]
            admin-mfa-user-entries)
      (conj [:enrolled_at [:maybe ms/TemporalInstant]])
      paged-schema))

(def ^:private UnenrolledUsersResponse
  (paged-schema (into [:map {:closed true}] admin-mfa-user-entries)))

;; `limit`/`offset` are deliberately absent from the query-param schemas below:
;; [[metabase.server.middleware.offset-paging]] strips them from :params and exposes them through
;; `request/limit` and `request/offset` instead.

(api.macros/defendpoint :get "/admin/enrolled-users" :- EnrolledUsersResponse
  "Admin: users who have a confirmed second factor. Never feature-gated, for the same reason
  `/admin/remove` isn't — after a licence lapse an admin must still be able to find and unlock a
  locked-out user.

  Takes `limit`/`offset` for pagination, and `query` to search on first name, last name, and email."
  [_route-params
   {:keys [query]} :- [:map [:query {:optional true} [:maybe :string]]]]
  (api/check-superuser)
  (user-list-response true query))

(api.macros/defendpoint :get "/admin/unenrolled-users" :- UnenrolledUsersResponse
  "Admin: active users who have not set up a second factor. Matches `unenrolled_count` from
  `/admin/overview`, so people who sign in through SSO are included even though the login gate never
  challenges them — their identity provider owns MFA. Never feature-gated, as above.

  Takes `limit`/`offset` for pagination, and `query` to search on first name, last name, and email."
  [_route-params
   {:keys [query]} :- [:map [:query {:optional true} [:maybe :string]]]]
  (api/check-superuser)
  (user-list-response false query))

;;; -------------------------------------------------- Recovery codes --------------------------------------------------

(api.macros/defendpoint :post "/recovery-codes" :- [:map [:recovery_codes [:sequential ms/NonBlankString]]]
  "Regenerate the current user's recovery codes, invalidating the entire previous set. Re-auth is a
  fresh second factor — a TOTP code or an unused recovery code — so a stolen password alone can
  never rotate the codes. The plaintext codes are returned exactly once; only hashes are stored."
  [_route-params
   _query-params
   {:keys [code]} :- [:map [:code ms/NonBlankString]]]
  (throttled :regenerate
             (fn []
               (t2/with-transaction [_conn]
                 (when-not (verification/verify-attempt! api/*current-user-id* code nil)
                   (throw (invalid-code-ex)))
                 {:recovery_codes (enrollment/reset-recovery-codes! api/*current-user-id*)}))))

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
   [metabase-enterprise.mfa.enrollment :as enrollment]
   [metabase-enterprise.mfa.settings :as mfa.settings]
   [metabase-enterprise.mfa.throttling :as mfa.throttling]
   [metabase-enterprise.mfa.totp :as totp]
   [metabase-enterprise.mfa.verification :as verification]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.appearance.core :as appearance]
   [metabase.channel.email.messages :as messages]
   [metabase.events.core :as events]
   [metabase.premium-features.core :as premium-features]
   [metabase.sso.core :as sso]
   [metabase.util.encryption :as encryption]
   [metabase.util.i18n :refer [tru]]
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
                    (t2/select-one-fn :credentials :model/AuthIdentity :user_id user-id :provider "password")]
           (and password_hash (u.password/verify-password password password_salt password_hash)))
         (when (sso/ldap-enabled)
           (when-let [user-email (t2/select-one-fn :email :model/User user-id)]
             (when-let [user-info (sso/find-user user-email)]
               (sso/verify-password user-info password))))))))

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
               (let [secret     (or (enrollment/start-enrollment! api/*current-user-id*)
                                    (throw (ex-info (tru "Two-factor authentication is already set up. Disable it before re-enrolling.")
                                                    {:status-code 400})))
                     user-email (t2/select-one-fn :email :model/User api/*current-user-id*)]
                 {:secret      secret
                  :otpauth_uri (totp/otpauth-uri {:issuer (or (appearance/site-name) "Metabase")
                                                  :account user-email
                                                  :secret  secret})}))))

(api.macros/defendpoint :post "/enroll/confirm" :- [:map
                                                    [:recovery_codes [:sequential ms/NonBlankString]]]
  "Confirm TOTP enrollment by verifying a code from the authenticator app. Activates the second
  factor and returns the single-use recovery codes — the only time they exist in plaintext."
  [_route-params
   _query-params
   {:keys [code]} :- [:map [:code ms/NonBlankString]]]
  (premium-features/assert-has-feature :multi-factor-auth (tru "Multi-factor authentication"))
  (let [codes (throttled :enroll
                         (fn []
                           (or (enrollment/confirm-enrollment! api/*current-user-id* code)
                               (throw (invalid-code-ex)))))
        user  (t2/select-one :model/User :id api/*current-user-id*)]
    (messages/send-mfa-enabled-email! (:email user))
    (events/publish-event! :event/mfa-enrolled {:object user})
    {:recovery_codes codes}))

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
  (let [user (t2/select-one :model/User :id api/*current-user-id*)]
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
  "Admin: remove a user's two-factor enrollment entirely — the lockout escape hatch for a lost
  authenticator with no recovery codes. Never feature-gated (a lapsed license must not make
  lockouts permanent). The affected user is notified by email. They re-enroll from scratch —
  there is nothing to \"reset\", the secret lives on their device."
  [_route-params
   _query-params
   {user-id :user_id} :- [:map [:user_id ms/PositiveInt]]]
  (api/check-superuser)
  (when (enrollment/disable! user-id)
    (let [user (t2/select-one :model/User :id user-id)]
      (messages/send-mfa-removed-by-admin-email! (:email user))
      (events/publish-event! :event/mfa-disabled {:object user})))
  api/generic-204-no-content)

(def ^:private unenrolled-user-where
  ;; active personal users without a confirmed TOTP enrollment; enrollment state is the
  ;; auth_identity.confirmed_at COLUMN (queryable), not the encrypted credentials JSON
  [:and
   [:= :core_user.is_active true]
   [:= :core_user.type "personal"]
   [:not [:exists {:select [1]
                   :from   [:auth_identity]
                   :where  [:and
                            [:= :auth_identity.user_id :core_user.id]
                            [:= :auth_identity.provider "totp"]
                            [:not= :auth_identity.confirmed_at nil]]}]]])

(api.macros/defendpoint :get "/admin/overview" :- [:map
                                                   [:encryption_key_set :boolean]
                                                   [:enrolled_count     :int]
                                                   [:unenrolled_count   :int]]
  "Admin: enrollment overview — how many users have (and haven't) set up a second factor, and
  whether the instance encrypts secrets at rest."
  []
  (api/check-superuser)
  {:encryption_key_set (encryption/default-encryption-enabled?)
   :enrolled_count     (t2/count :model/AuthIdentity :provider "totp" :confirmed_at [:not= nil])
   :unenrolled_count   (t2/count :model/User {:where unenrolled-user-where})})

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

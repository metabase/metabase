(ns metabase-enterprise.security-center.health-checks
  "PoC: Security Center health checks. Hardcoded checks over values only the running backend has."
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase-enterprise.security-center.settings :as settings]
   [metabase.app-db.core :as mdb]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting]
   [metabase.sso.core :as sso]
   [metabase.system.core :as system]
   [metabase.util :as u]
   [metabase.util.encryption :as encryption]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.util.concurrent ExecutorService Executors TimeoutException)))

(set! *warn-on-reflection* true)

(defn- pass [] {:status :pass})
(defn- fail [& details] {:status :fail :details (vec details)})
(defn- unknown [reason] {:status :unknown :reason reason})

(defn- env-set? [k]
  (not (str/blank? (config/config-str k))))

(def ^:private poc-hardcoded-version "v1.65.0")

(defn- current-major-version []
  (or (config/current-major-version)
      (config/major-version poc-hardcoded-version)))

(defn- check-supported-version []
  (let [major   (current-major-version)
        support (:major_version_support (setting/get :version-info))
        eol     (some->> support (filter #(= (:major %) major)) (keep :eol) sort last)]
    (cond
      (nil? major) (unknown (tru "Can''t tell the version of this Metabase build."))
      (empty? support) (unknown (tru "Version support info is not available. Is \"Check for updates\" on and can Metabase reach the internet?"))
      (nil? eol) (unknown (tru "No support info for version {0}." major))
      (t/after? (t/local-date) (t/local-date eol)) (fail (tru "Version {0} reached end of life on {1}." major eol))
      :else (pass))))

(defn- check-encryption-secret-key []
  (if (encryption/default-encryption-enabled?) (pass) (fail)))

(defn- check-session-secret-key []
  (if (env-set? :mb-session-secret-key) (pass) (fail)))

(defn- check-production-app-db []
  (if (= :h2 (mdb/db-type)) (fail) (pass)))

(defn- check-legacy-startup-encryption []
  (if (config/config-bool :mb-disable-legacy-startup-encryption) (pass) (fail)))

(defn- check-https-site-url []
  (let [url (system/site-url)]
    (cond
      (str/blank? url) (unknown (tru "Site URL is not set."))
      (str/starts-with? (u/lower-case-en url) "https:") (pass)
      :else (fail (tru "Site URL is {0}" url)))))

(defn- check-https-redirect []
  (if (setting/get :redirect-all-requests-to-https) (pass) (fail)))

(defn- check-sso-login []
  (let [sso?      (or (sso/sso-enabled?) (boolean (setting/get :scim-enabled)))
        password? (boolean (setting/get :enable-password-login))]
    (cond
      (not sso?) (fail (tru "No SSO or SCIM is enabled."))
      password?  (fail (tru "Password login is still on."))
      :else      (pass))))

(defn- check-mfa-required []
  (let [enforcement (setting/get :mfa-enforcement)
        deadline    (setting/get :mfa-requirement-deadline)]
    (cond
      (not= :required (keyword enforcement)) (fail (tru "Two-factor authentication is {0}." (name enforcement)))
      (and deadline (t/before? (t/offset-date-time) (t/offset-date-time deadline)))
      (fail (tru "Two-factor authentication becomes required on {0}." (str deadline)))
      :else (pass))))

(defn- check-all-users-permissions []
  (let [group-id   (:id (perms/all-users-group))
        curate?    (t2/exists? :model/Permissions :group_id group-id :object "/collection/root/")
        db-ids     (->> (t2/select :model/DataPermissions :group_id group-id :perm_type :perms/create-queries)
                        (remove #(= :no (:perm_value %)))
                        (into #{} (map :db_id)))
        db-names   (when (seq db-ids)
                     (t2/select-fn-vec :name :model/Database :id [:in db-ids] :is_audit false {:order-by [:name]}))
        details    (cond-> []
                     curate?         (conj (tru "All Users can curate Our analytics."))
                     (seq db-names) (conj (tru "All Users can query: {0}" (str/join ", " db-names))))]
    (if (seq details) (apply fail details) (pass))))

(def ^:private db-timeout-seconds 30)

(defn- writable-privileges? [rows]
  (some (fn [row] (and (nil? (:role row)) (or (:insert row) (:update row) (:delete row)))) rows))

(defn- check-database-privileges [database]
  (let [engine (keyword (:engine database))]
    (if-not (driver/database-supports? engine :table-privileges database)
      {:database (:name database) :status :unknown :reason (tru "{0} is not supported" (name engine))}
      (let [started (System/nanoTime)
            fut     (future (driver/current-user-table-privileges engine database))]
        (try
          (let [rows (deref fut (* 1000 db-timeout-seconds) ::timeout)
                ms   (quot (- (System/nanoTime) started) 1000000)]
            (when (= rows ::timeout)
              (future-cancel fut)
              (throw (TimeoutException. (str "Timed out after " db-timeout-seconds "s"))))
            (log/infof "Health check privileges for %s (%s): %d rows in %d ms" (:name database) (name engine) (count rows) ms)
            {:database (:name database)
             :status   (if (writable-privileges? rows) :fail :pass)
             :ms       ms})
          (catch Throwable e
            {:database (:name database) :status :unknown :reason (ex-message e)}))))))

(defonce ^:private background-results (atom {}))

(defonce ^:private ^ExecutorService background-executor (Executors/newSingleThreadExecutor))

(defn- run-read-only-connections! []
  (let [databases (t2/select :model/Database :is_audit false {:order-by [:name]})
        started   (System/nanoTime)
        results   (mapv check-database-privileges databases)
        failing   (filter #(= :fail (:status %)) results)
        unknowns  (filter #(= :unknown (:status %)) results)
        result    (cond
                    (seq failing)
                    (assoc (fail) :databases results)

                    (and (seq unknowns) (= (count unknowns) (count results)))
                    (assoc (unknown (str/join "; " (map #(str (:database %) ": " (:reason %)) unknowns)))
                           :databases results)

                    :else
                    (assoc (pass) :databases results))]
    (log/infof "Health check read-only-connections: %d databases in %d ms"
               (count databases) (quot (- (System/nanoTime) started) 1000000))
    (swap! background-results assoc "read-only-connections" (assoc result :checked_at (t/offset-date-time)))))

(defn- run-background-safely! []
  (try
    (run-read-only-connections!)
    (catch Throwable e
      (swap! background-results assoc "read-only-connections"
             (assoc (unknown (ex-message e)) :checked_at (t/offset-date-time))))))

(defn- submit-background! []
  (swap! background-results update "read-only-connections" #(assoc (or % {:status :unknown}) :running true))
  (.submit background-executor ^Runnable run-background-safely!))

(defn- run-background-sync! []
  (.get (.submit background-executor ^Callable run-background-safely!)))

(defn- check-read-only-connections []
  (or (get @background-results "read-only-connections")
      (do (submit-background!)
          (assoc (unknown (tru "Checking databases…")) :running true))))

(def ^:private docs "https://www.metabase.com/docs/latest/")

(defn- checks []
  [{:id               "supported-version"
    :title            (tru "Metabase version is supported")
    :description      (tru "Versions past their end of life don''t get security fixes.")
    :remediation      (tru "Upgrade to the latest version or an LTS version.")
    :docs_url         "https://www.metabase.com/version-support"
    :run              check-supported-version}
   {:id               "encryption-secret-key"
    :title            (tru "Encryption key is set")
    :description      (tru "Without MB_ENCRYPTION_SECRET_KEY, database connection details and other secrets are stored in the app DB as plain text.")
    :remediation      (tru "Set MB_ENCRYPTION_SECRET_KEY and restart. For an existing instance, run the one-time encryption procedure first. Store the key separately: losing it makes encrypted values unrecoverable.")
    :docs_url         (str docs "databases/encrypting-details-at-rest")
    :requires_restart true
    :run              check-encryption-secret-key}
   {:id               "session-secret-key"
    :title            (tru "Session secret key is set")
    :description      (tru "Without MB_SESSION_SECRET_KEY, anyone with access to the app DB can forge a session and act as any user.")
    :remediation      (tru "Set MB_SESSION_SECRET_KEY to at least 16 random characters and restart. All users get logged out once.")
    :docs_url         (str docs "configuring-metabase/environment-variables#mb_session_secret_key")
    :requires_restart true
    :run              check-session-secret-key}
   {:id               "production-app-db"
    :title            (tru "App database is production-ready")
    :description      (tru "The built-in H2 database is meant for trying Metabase out, not for production.")
    :remediation      (tru "Migrate the app DB to Postgres.")
    :docs_url         (str docs "installation-and-operation/migrating-from-h2")
    :requires_restart true
    :run              check-production-app-db}
   {:id               "legacy-startup-encryption"
    :title            (tru "Legacy startup encryption is off")
    :description      (tru "On startup Metabase silently encrypts values that were stored unencrypted. With the flag on, it refuses to start instead, so tampering is noticed.")
    :remediation      (tru "Set MB_DISABLE_LEGACY_STARTUP_ENCRYPTION=true and restart.")
    :docs_url         (str docs "configuring-metabase/environment-variables#mb_disable_legacy_startup_encryption")
    :requires_restart true
    :run              check-legacy-startup-encryption}
   {:id               "https-site-url"
    :title            (tru "Site URL uses HTTPS")
    :description      (tru "Without HTTPS, passwords and session cookies travel in plain text.")
    :remediation      (tru "Serve Metabase over HTTPS and set the site URL to https://…")
    :docs_url         (str docs "configuring-metabase/settings#site-url")
    :run              check-https-site-url}
   {:id               "https-redirect"
    :title            (tru "HTTP requests are redirected to HTTPS")
    :description      (tru "Users who open the http:// address stay on an unencrypted connection.")
    :remediation      (tru "Turn on \"Redirect to HTTPS\". Requires an HTTPS site URL.")
    :docs_url         (str docs "configuring-metabase/settings#redirect-to-https")
    :run              check-https-redirect}
   {:id               "mfa-required"
    :title            (tru "Two-factor authentication is required")
    :description      (tru "A stolen password is enough to sign in when 2FA is not required.")
    :remediation      (tru "Require 2FA for all users. If login goes only through SSO, enforce MFA at the identity provider instead.")
    :docs_url         (str docs "people-and-groups/two-factor-authentication")
    :applies?         #(premium-features/has-feature? :multi-factor-auth)
    :run              check-mfa-required}
   {:id               "sso-login"
    :title            (tru "Users sign in through SSO")
    :description      (tru "Passwords managed in Metabase are easier to leak and are not covered by your identity provider''s policies.")
    :remediation      (tru "Set up SSO or SCIM, test recovery access, then turn off password login.")
    :docs_url         (str docs "people-and-groups/start#authentication")
    :run              check-sso-login}
   {:id               "read-only-connections"
    :title            (tru "Database connections are read-only")
    :description      (tru "A connection user that can write lets anyone with native query access change or delete data.")
    :remediation      (tru "Make the main connection user read-only. If the database needs writes, add a writable connection with a separate, narrowly scoped user.")
    :docs_url         (str docs "databases/users-roles-privileges")
    :background       true
    :run              check-read-only-connections}
   {:id               "all-users-permissions"
    :title            (tru "All Users group has limited access")
    :description      (tru "Everyone in Metabase is in All Users, so its permissions apply to every new user.")
    :remediation      (tru "Restrict All Users and grant access through other groups.")
    :docs_url         (str docs "permissions/introduction")
    :run              check-all-users-permissions}])

(defn- run-check [{:keys [id run]}]
  (let [started (System/nanoTime)
        result  (try
                  (run)
                  (catch Throwable e
                    (log/warnf e "Health check %s failed" id)
                    (unknown (ex-message e))))]
    (cond-> result
      (not (:checked_at result)) (assoc :checked_at (t/offset-date-time))
      true                       (assoc :ms (quot (- (System/nanoTime) started) 1000000)))))

(defn- users-by-id [ids]
  (when (seq ids)
    (into {}
          (map (juxt :id #(select-keys % [:id :common_name :email])))
          (t2/select :model/User :id [:in ids]))))

(defn- clear-passed-acknowledgements! [results]
  (let [acks   (settings/security-center-health-check-acknowledgements)
        passed (set (keep #(when (= :pass (:status %)) (:id %)) results))
        stale  (filter passed (keys acks))]
    (when (seq stale)
      (settings/security-center-health-check-acknowledgements! (apply dissoc acks stale)))
    (apply dissoc acks stale)))

(defn- applicable-checks []
  (filter #((or (:applies? %) (constantly true))) (checks)))

(defn- run-and-format [checks]
  (let [results (mapv #(merge (dissoc % :run :applies?) (run-check %)) checks)
        acks    (clear-passed-acknowledgements! results)
        users   (users-by-id (keep #(get-in acks [% :user_id]) (keys acks)))]
    (mapv (fn [{:keys [id] :as check}]
            (let [ack (get acks id)]
              (-> check
                  (update :status name)
                  (assoc :requires_restart (boolean (:requires_restart check))
                         :background       (boolean (:background check))
                         :acknowledged_by  (some-> ack :user_id users)
                         :acknowledged_at  (:at ack)))))
          results)))

(defn list-health-checks
  "Run all health checks that apply. Background checks return their last stored result."
  []
  (run-and-format (applicable-checks)))

(defn recheck!
  "Re-run all checks synchronously, background ones included. Returns the full list."
  []
  (run-background-sync!)
  (list-health-checks))

(defn recheck-one!
  "Re-run one check synchronously, even a background one. Returns its fresh result."
  [check-id]
  (let [check (or (some #(when (= check-id (:id %)) %) (applicable-checks))
                  (throw (ex-info (tru "Unknown health check {0}" check-id) {:status-code 404})))]
    (when (:background check)
      (run-background-sync!))
    (first (run-and-format [check]))))

(defn acknowledge!
  "Acknowledge a failed check. Cleared once the check passes again."
  [check-id user-id]
  (when-not (some #(= check-id (:id %)) (checks))
    (throw (ex-info (tru "Unknown health check {0}" check-id) {:status-code 404})))
  (settings/security-center-health-check-acknowledgements!
   (assoc (settings/security-center-health-check-acknowledgements)
          check-id {:user_id user-id :at (str (t/offset-date-time))})))

(defn unacknowledge!
  "Remove an acknowledgement."
  [check-id]
  (settings/security-center-health-check-acknowledgements!
   (dissoc (settings/security-center-health-check-acknowledgements) check-id)))

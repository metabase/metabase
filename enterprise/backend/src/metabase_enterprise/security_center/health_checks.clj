(ns metabase-enterprise.security-center.health-checks
  "The Security Center health checks: the registry of checks, and the run of one check into the `HealthCheck` the API
  returns.

  A check is one entry in the registry, with the texts as deferred translations and two zero-argument functions,
  `:applicable?` and `:run`. The registry is read through [[all-checks]], [[check-by-id]]
  and [[check-ids]] only, so the way it is stored can change without touching its callers."
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase-enterprise.security-center.db :as security-center.db]
   [metabase.config.core :as config]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]
   [metabase.security-center.schema :as security-center.schema]
   [metabase.session.core :as session]
   [metabase.settings.core :as setting]
   [metabase.system.core :as system]
   [metabase.util.encryption :as encryption]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(mr/def ::entry
  "One check as registered: the texts and the docs link the API returns, and the functions that compute the check.
  `:applicable?` says whether the check is returned at all. `:run` computes the items and is always fast.
  `:refresh` is the slow work of a background check; it stores a result that `:run` reads."
  [:map {:closed true}
   [:id                ::security-center.schema/health-check-id]
   [:severity          ::security-center.schema/severity]
   [:title             ms/LocalizedString]
   [:description       ms/LocalizedString]
   [:remediation       ms/LocalizedString]
   [:docs-page         ms/NonBlankString]
   [:docs-anchor       {:optional true} ms/NonBlankString]
   [:requires-restart? :boolean]
   [:applicable?       fn?]
   [:run               fn?]
   [:refresh           {:optional true} fn?]])

(mr/def ::items
  "What `:run` returns: at least one item, so a check always reports something."
  [:sequential {:min 1} ::security-center.schema/health-check-item])

(mr/def ::registry
  [:map-of ::security-center.schema/health-check-id ::entry])

(mu/defn- validated-registry :- ::registry
  "Returns `registry` once every key is its entry's `:id`. With the schema on the argument, a wrong entry fails when
  the namespace loads, not when the first request arrives."
  [registry :- ::registry]
  (doseq [[id entry] registry
          :when (not= id (:id entry))]
    (throw (ex-info (format "Health check %s is registered under %s" (:id entry) id)
                    {:key id, :id (:id entry)})))
  registry)

;;; Items

(defn- item
  [status message]
  {:status status, :message (str message)})

(defn- pass-or-fail
  [ok? pass-message fail-message]
  (if ok?
    (item :pass pass-message)
    (item :fail fail-message)))

;;; The checks

(def ^:private encryption-secret-key
  {:id                :encryption-secret-key
   :severity          :high
   :title             (deferred-tru "Database connection details should be encrypted")
   :description       (deferred-tru "Without MB_ENCRYPTION_SECRET_KEY, connection details are stored in plain text in the app DB.")
   :remediation       (deferred-tru "Set MB_ENCRYPTION_SECRET_KEY and restart Metabase.")
   :docs-page         "databases/encrypting-details-at-rest"
   :requires-restart? true
   :applicable?       (constantly true)
   :run               (fn []
                        [(pass-or-fail (encryption/default-encryption-enabled?)
                                       (tru "MB_ENCRYPTION_SECRET_KEY is set")
                                       (tru "MB_ENCRYPTION_SECRET_KEY is not set"))])})

(def ^:private session-secret-key
  {:id                :session-secret-key
   :severity          :high
   :title             (deferred-tru "Session secret key should be set")
   :description       (deferred-tru "Without MB_SESSION_SECRET_KEY, sessions are signed with a generated key.")
   :remediation       (deferred-tru "Set MB_SESSION_SECRET_KEY and restart Metabase.")
   :docs-page         "configuring-metabase/environment-variables"
   :docs-anchor       "mb_session_secret_key"
   :requires-restart? true
   :applicable?       (constantly true)
   :run               (fn []
                        ;; [[config/config-str]] returns nil for a blank value. The value itself never reaches an item.
                        [(pass-or-fail (some? (config/config-str :mb-session-secret-key))
                                       (tru "MB_SESSION_SECRET_KEY is set")
                                       (tru "MB_SESSION_SECRET_KEY is not set"))])})

(def ^:private legacy-startup-encryption
  {:id                :legacy-startup-encryption
   :severity          :medium
   :title             (deferred-tru "Legacy startup encryption should be turned off")
   :description       (deferred-tru "Legacy startup encryption keeps an older, weaker way to decrypt settings at startup.")
   :remediation       (deferred-tru "Set MB_DISABLE_LEGACY_STARTUP_ENCRYPTION to true and restart Metabase.")
   :docs-page         "configuring-metabase/environment-variables"
   :docs-anchor       "mb_disable_legacy_startup_encryption"
   :requires-restart? true
   :applicable?       (constantly true)
   :run               (fn []
                        [(pass-or-fail (true? (config/config-bool :mb-disable-legacy-startup-encryption))
                                       (tru "MB_DISABLE_LEGACY_STARTUP_ENCRYPTION is true")
                                       (tru "MB_DISABLE_LEGACY_STARTUP_ENCRYPTION is not true"))])})

(def ^:private https-site-url
  {:id                :https-site-url
   :severity          :high
   :title             (deferred-tru "Site URL should use HTTPS")
   :description       (deferred-tru "Links in emails and embeds use the site URL.")
   :remediation       (deferred-tru "Set a Site URL that starts with https:.")
   :docs-page         "configuring-metabase/environment-variables"
   :docs-anchor       "mb_site_url"
   :requires-restart? false
   :applicable?       (constantly true)
   :run               (fn []
                        (let [site-url (system/site-url)]
                          [(cond
                             (nil? site-url)                      (item :fail (tru "Site URL is not set"))
                             (str/starts-with? site-url "https:") (item :pass (tru "Site URL starts with https:"))
                             :else                                (item :fail (tru "Site URL does not start with https:")))]))})

(def ^:private https-redirect
  {:id                :https-redirect
   :severity          :medium
   :title             (deferred-tru "All requests should be redirected to HTTPS")
   :description       (deferred-tru "Without the redirect, people can open Metabase over plain HTTP.")
   :remediation       (deferred-tru "Turn on Redirect to HTTPS in Admin settings.")
   :docs-page         "configuring-metabase/environment-variables"
   :docs-anchor       "mb_redirect_all_requests_to_https"
   :requires-restart? false
   :applicable?       (constantly true)
   :run               (fn []
                        [(pass-or-fail (setting/get :redirect-all-requests-to-https)
                                       (tru "Redirect to HTTPS is on")
                                       (tru "Redirect to HTTPS is off"))])})

(def ^:private sso-login
  {:id                :sso-login
   :severity          :medium
   :title             (deferred-tru "People should sign in with SSO")
   :description       (deferred-tru "SSO lets your identity provider enforce MFA.")
   :remediation       (deferred-tru "Turn on SAML, OIDC or JWT.")
   :docs-page         "people-and-groups/start"
   :docs-anchor       "sso-for-metabase-pro-and-enterprise-plans"
   :requires-restart? false
   :applicable?       (constantly true)
   :run               (fn []
                        ;; Each of these settings has a `:feature`, so it reads as off on a token without it.
                        (let [on (cond-> []
                                   (setting/get :saml-enabled) (conj (item :pass (tru "SAML is on")))
                                   (setting/get :oidc-enabled) (conj (item :pass (tru "OIDC is on")))
                                   (setting/get :jwt-enabled)  (conj (item :pass (tru "JWT is on"))))]
                          (if (seq on)
                            on
                            [(item :fail (tru "None of SAML, OIDC or JWT is on"))])))})

(def ^:private scim-provisioning
  {:id                :scim-provisioning
   :severity          :low
   :title             (deferred-tru "Users should be provisioned with SCIM")
   :description       (deferred-tru "Without SCIM, people who leave your identity provider keep their Metabase accounts.")
   :remediation       (deferred-tru "Turn on SCIM user provisioning in Admin settings.")
   :docs-page         "people-and-groups/user-provisioning"
   :requires-restart? false
   :applicable?       premium-features/enable-scim?
   :run               (fn []
                        [(pass-or-fail (setting/get :scim-enabled)
                                       (tru "SCIM is on")
                                       (tru "SCIM is off"))])})

(def ^:private mfa-required
  {:id                :mfa-required
   :severity          :medium
   :title             (deferred-tru "Two-factor authentication should be required")
   :description       (deferred-tru "A stolen password alone is enough to sign in.")
   :remediation       (deferred-tru "Require 2FA for password and LDAP login.")
   :docs-page         "people-and-groups/two-factor-authentication"
   :requires-restart? false
   ;; Metabase 2FA covers password and LDAP login only, so the check is hidden when both are off.
   :applicable?       (fn []
                        (and (premium-features/enable-multi-factor-auth?)
                             (boolean (or (setting/get :enable-password-login)
                                          (setting/get :ldap-enabled)))))
   :run               (fn []
                        [(pass-or-fail (session/mfa-required?)
                                       (tru "2FA is required")
                                       (tru "2FA is not required"))])})

(def ^:private all-users-permissions
  {:id                :all-users-permissions
   :severity          :medium
   :title             (deferred-tru "All Users should have limited permissions")
   :description       (deferred-tru "Everyone who signs in gets the permissions of All Users.")
   :remediation       (deferred-tru "Remove Curate on Our analytics and query access to every database from All Users.")
   :docs-page         "permissions/introduction"
   :docs-anchor       "key-points-regarding-permissions"
   :requires-restart? false
   :applicable?       (constantly true)
   :run               (fn []
                        (let [{group-id :id, group-name :name} (perms/all-users-group)
                              root-permission (get-in (perms/graph nil #{:root} #{group-id}) [:groups group-id :root])
                              databases       (security-center.db/group-queryable-databases group-id)]
                          (into [(assoc (pass-or-fail (not= :write root-permission)
                                                      (tru "All Users can''t curate Our analytics")
                                                      (tru "All Users can curate Our analytics"))
                                        :entity_type :collection
                                        :entity_id   "root"
                                        :entity_name (tru "Our analytics"))]
                                (if (empty? databases)
                                  [(assoc (item :pass (tru "All Users can''t query any database"))
                                          :entity_type :group
                                          :entity_id   group-id
                                          :entity_name group-name)]
                                  (for [{db-id :id, db-name :name} databases]
                                    (assoc (item :fail (tru "All Users can query {0}" db-name))
                                           :entity_type :database
                                           :entity_id   db-id
                                           :entity_name db-name))))))})

(mr/def ::major-version-support
  "One entry of the version feed's `major_version_support`, as far as the supported-version check reads it. Open, so a
  new feed key does not break the check."
  [:map {:closed false, ::mr/deliberately-open true}
   [:major :int]
   [:eol   :string]])

(defn- supported-version-items
  []
  (let [major   (config/current-major-version)
        support (:major_version_support (setting/get :version-info))]
    (cond
      (not (setting/get :check-for-updates))
      [(item :unknown (tru "Turn on Check for updates so Metabase can see when your version reaches end of life"))]

      ;; the upgrade check writes the timestamp before each fetch, and empties the version info when the fetch fails
      (nil? (setting/get :version-info-last-checked))
      [(item :unknown (tru "Version info hasn''t been fetched yet"))]

      (not (mr/validate [:sequential {:min 1} ::major-version-support] support))
      [(item :unknown (tru (str "Couldn''t fetch version info from static.metabase.com. Allow outbound HTTPS to it from the Metabase "
                                "server, or point MB_VERSION_INFO_EE_URL to a mirror. The Metabase log has the error")))]

      (nil? major)
      [(item :unknown (tru "Can''t tell the version of this build"))]

      :else
      (let [majors (map :major support)
            eol    (->> support
                        (filter #(= major (:major %)))
                        (map :eol)
                        sort
                        last)]
        (cond
          (> major (apply max majors))
          [(item :pass (tru "Version {0} is newer than every version in the version info" major))]

          (< major (apply min majors))
          [(item :fail (tru "Version {0} is older than every version in the version info" major))]

          (nil? eol)
          [(item :unknown (tru "Version {0} is not in the version info" major))]

          (t/after? (t/local-date) (t/local-date eol))
          [(item :fail (tru "Version {0} reached end of life on {1}" major eol))]

          :else
          [(item :pass (tru "Version {0} is supported until {1}" major eol))])))))

(def ^:private supported-version
  {:id                :supported-version
   :severity          :high
   :title             (deferred-tru "Metabase version should be supported")
   :description       (deferred-tru "Versions past end of life get no security fixes.")
   :remediation       (deferred-tru "Upgrade to a supported version.")
   :docs-page         "installation-and-operation/upgrading-metabase"
   :requires-restart? true
   :applicable?       (constantly true)
   :run               supported-version-items})

;;; The registry

(def ^:private checks
  "The registry: one entry per check, keyed by its id. Read it through [[all-checks]], [[check-by-id]] and
  [[check-ids]]."
  (validated-registry
   {:encryption-secret-key     encryption-secret-key
    :session-secret-key        session-secret-key
    :legacy-startup-encryption legacy-startup-encryption
    :https-site-url            https-site-url
    :https-redirect            https-redirect
    :sso-login                 sso-login
    :scim-provisioning         scim-provisioning
    :mfa-required              mfa-required
    :all-users-permissions     all-users-permissions
    :supported-version         supported-version}))

(defn all-checks
  "Every registered check, in id order."
  []
  (sort-by :id (vals checks)))

(defn check-by-id
  "The registered check with `id`, or nil."
  [id]
  (get checks id))

(defn check-ids
  "The id of every registered check, in id order."
  []
  (sort (keys checks)))

(mu/defn status-of :- ::security-center.schema/health-check-status
  "The status of a check from its items: any item fails → fail; else any item unknown → unknown; else pass."
  [items :- [:sequential ::security-center.schema/health-check-item]]
  (let [statuses (into #{} (map :status) items)]
    (cond
      (statuses :fail)    :fail
      (statuses :unknown) :unknown
      :else               :pass)))

(mu/defn applicable? :- :boolean
  "Whether `entry` is returned at all. A throw counts as applicable, so an error shows up as an unknown check instead
  of hiding the check."
  [{:keys [id applicable?]} :- ::entry]
  (try
    (boolean (applicable?))
    (catch Throwable e
      (log/errorf e "Health check %s could not tell whether it applies" (name id))
      true)))

(defn- unknown-item
  [message]
  {:status :unknown, :message (str message)})

(mu/defn- run-items :- ::items
  "The items of `entry`'s `:run`. A throw, an empty result and an item outside the schema each become one unknown
  item with a message, so a broken check reports itself and leaves the other checks alone."
  [{:keys [id run]} :- ::entry]
  (try
    (mu/validate-throw ::items (vec (run)))
    (catch Throwable e
      (log/errorf e "Health check %s failed" (name id))
      ;; a generic text: an exception message may hold anything, and the log has it
      [(unknown-item (tru "Couldn''t run this check. Check the server logs for the underlying error."))])))

(mu/defn run-check :- ::security-center.schema/health-check
  "Runs `entry` and returns the `HealthCheck` the API serves: the texts in the current user's locale, the items of this
  run, and the status that [[status-of]] derives from them."
  [{:keys [id severity title description remediation docs-page docs-anchor requires-restart?] :as entry} :- ::entry]
  (let [items (run-items entry)]
    {:id               id
     :severity         severity
     :title            (str title)
     :description      (str description)
     :remediation      (str remediation)
     :docs             (cond-> {:page docs-page}
                         docs-anchor (assoc :anchor docs-anchor))
     :requires_restart requires-restart?
     :status           (status-of items)
     :checked_at       (t/offset-date-time)
     :items            items}))

(mu/defn run-checks :- [:sequential ::security-center.schema/health-check]
  "Runs every registered check that applies, in id order."
  []
  (into []
        (comp (filter applicable?)
              (map run-check))
        (all-checks)))

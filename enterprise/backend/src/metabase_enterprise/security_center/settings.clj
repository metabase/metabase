(ns metabase-enterprise.security-center.settings
  "Settings for Security Center notification channels."
  (:require
   [metabase.permissions.core :as perms]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting security-center-email-recipients
  (deferred-tru "List of email recipients for Security Center notifications.")
  :type       :json
  :default    nil
  :encryption :when-encryption-key-set
  :feature    :admin-security-center
  :visibility :admin
  :export?    false
  :doc        false
  :audit      :getter
  :getter     (fn []
                (or
                 (some->> (setting/get-value-of-type :json :security-center-email-recipients)
                          (mapv #(update % :type keyword))
                          not-empty)
                 ;; default to all admins -- can't use (perms/admin-group) inline in :default as the group may not exist yet
                 [{:type :notification-recipient/group, :permissions_group_id (:id (perms/admin-group))}]))
  :setter     (fn [new-value]
                (when (empty? new-value)
                  (throw (ex-info (str (deferred-tru "At least one email recipient is required."))
                                  {:status-code 400})))
                (setting/set-value-of-type! :json :security-center-email-recipients new-value)))

(defsetting security-center-slack-channel
  (deferred-tru "Slack channel for Security Center notifications. Null means Slack notifications are disabled.")
  :type       :string
  :default    nil
  :encryption :when-encryption-key-set
  :feature    :admin-security-center
  :visibility :admin
  :export?    false
  :doc        false
  :audit      :getter
  :setter     (fn [new-value]
                (when (and (some? new-value)
                           (not (setting/get-value-of-type :boolean :slack-token-valid?)))
                  (throw (ex-info (str (deferred-tru "Slack is not configured for this instance."))
                                  {:status-code 400})))
                (setting/set-value-of-type! :string :security-center-slack-channel new-value)))

(def ^:private default-severity-repeat-days
  {:critical 1 :high 3 :medium 7 :low 7})

(defsetting security-center-severity-repeat-days
  "Number of days between repeat notifications for each severity level."
  :type       :json
  :default    default-severity-repeat-days
  :encryption :no
  :feature    :admin-security-center
  :visibility :internal
  :export?    false
  :doc        false
  :audit      :never
  :getter     (fn []
                (some-> (setting/get-value-of-type :json :security-center-severity-repeat-days)
                        (update-keys keyword))))

(defsetting security-center-sync-state
  "Outcome of the advisory syncs: `:last-synced-at` (last successful fetch), `:last-sync-attempted-at`,
  `:last-sync-error`, and `:evaluated-version`, the version tag that last evaluated the advisories."
  :type               :json
  :default            nil
  :encryption         :no
  :feature            :admin-security-center
  :visibility         :internal
  :export?            false
  :doc                false
  :audit              :never
  :include-in-list?   false
  :can-read-from-env? false)

(defn last-synced-at
  "Timestamp of the last successful advisory sync."
  []
  (some-> (security-center-sync-state) :last-synced-at u.date/parse))

(defn last-sync-attempted-at
  "Timestamp of the last advisory sync attempt, successful or not."
  []
  (some-> (security-center-sync-state) :last-sync-attempted-at u.date/parse))

(defn last-sync-error
  "Error message of the last advisory sync, or nil if it succeeded."
  []
  (some-> (security-center-sync-state) :last-sync-error))

(defn last-evaluated-version
  "Version tag of the Metabase that last evaluated the advisories."
  []
  (some-> (security-center-sync-state) :evaluated-version))

(defsetting security-center-health-check-results
  "The last result of each background health check, keyed by check id: what its refresh returned, and when."
  :type               :json
  :default            nil
  ;; holds statuses and database ids and names only, no secrets
  :encryption         :no
  :feature            :admin-security-center
  :visibility         :internal
  :export?            false
  :doc                false
  :audit              :never
  :include-in-list?   false
  :can-read-from-env? false)

(defn repeat-days-for-severity
  "Return repeat days for severity, defaults to 1 if not configured"
  [severity]
  (get (security-center-severity-repeat-days) severity 1))

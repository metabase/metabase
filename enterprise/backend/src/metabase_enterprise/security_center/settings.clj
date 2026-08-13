(ns metabase-enterprise.security-center.settings
  "Settings for Security Center notification channels."
  (:require
   [metabase.permissions.core :as perms]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting security-center-email-recipients
  (deferred-tru "List of email recipients for Security Center notifications.")
  :type       :json
  :default    nil
  :encryption :no
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
  :encryption :no
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
  (deferred-tru "Number of days between repeat notifications for each severity level.")
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

(defsetting security-center-last-synced-at
  (deferred-tru "Timestamp of the last successful Security Center advisory sync.")
  :type               :timestamp
  :default            nil
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

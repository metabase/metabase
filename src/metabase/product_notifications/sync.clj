(ns metabase.product-notifications.sync
  "Transactional reconciliation of validated product notification feeds."
  (:require
   [java-time.api :as t]
   [metabase.models.interface :as mi]
   [metabase.product-notifications.fetch :as fetch]
   [metabase.product-notifications.models.product-notification]
   [metabase.product-notifications.models.product-notification-dismissal]
   [metabase.product-notifications.settings :as settings]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private immutable-fields
  [:notification_id
   :schema_version
   :title
   :content
   :icon
   :audience
   :deployment
   :edition
   :min_version
   :max_version
   :starts_at
   :ends_at])

(defn- immutable-view
  [notification]
  (-> (select-keys notification immutable-fields)
      (update :starts_at #(some-> % t/instant))
      (update :ends_at #(some-> % t/instant))))

(defn- check-immutable!
  [existing incoming]
  (when-not (= (immutable-view existing)
               (immutable-view incoming))
    (throw (ex-info "Changed product notifications must use a new ID"
                    {:notification-id (:notification_id incoming)}))))

(mu/defn sync-notifications!
  "Reconcile a normalized, complete feed in one transaction.

  Remote content is immutable by notification ID. Missing or unsupported IDs
  are retired, while a later reappearance reactivates the original row."
  [{:keys [notifications]} :- [:map
                               [:notifications [:vector :map]]
                               [:present-ids [:set :string]]]]
  (let [now           (mi/now)
        supported-ids (into #{} (map :notification_id) notifications)]
    (t2/with-transaction [_conn]
      (let [existing-by-id (t2/select-fn->fn :notification_id identity :model/ProductNotification)]
        (doseq [notification notifications
                :let [existing (existing-by-id (:notification_id notification))]
                :when existing]
          (check-immutable! existing notification))
        (doseq [notification notifications
                :let [notification-id (:notification_id notification)
                      existing        (existing-by-id notification-id)]]
          (if existing
            (t2/update! :model/ProductNotification (:id existing)
                        {:position     (:position notification)
                         :active       true
                         :retired_at   nil
                         :last_seen_at now})
            (t2/insert! :model/ProductNotification
                        (assoc notification
                               :active true
                               :last_seen_at now))))
        (doseq [existing (vals existing-by-id)
                :when (and (:active existing)
                           (not (contains? supported-ids (:notification_id existing))))]
          (t2/update! :model/ProductNotification (:id existing)
                      {:active     false
                       :retired_at now}))))
    nil))

(defn sync-from-source!
  "Fetch and reconcile the remote feed, recording success only after the transaction commits."
  []
  (sync-notifications! (fetch/fetch-feed))
  (settings/product-notifications-last-synced-at! (t/offset-date-time))
  nil)

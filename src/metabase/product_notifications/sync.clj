(ns metabase.product-notifications.sync
  "Best-effort reconciliation of validated product notification feeds."
  (:require
   [java-time.api :as t]
   [metabase.models.interface :as mi]
   [metabase.product-notifications.fetch :as fetch]
   [metabase.product-notifications.models.product-notification]
   [metabase.product-notifications.settings :as settings]
   [metabase.util.log :as log]
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
                    {:phase           :immutability
                     :notification-id (:notification_id incoming)}))))

(defn- sync-notification!
  [existing notification now]
  (t2/with-transaction [_conn]
    (if existing
      (do
        (check-immutable! existing notification)
        (t2/update! :model/ProductNotification (:id existing)
                    {:position     (:position notification)
                     :active       true
                     :retired_at   nil
                     :last_seen_at now}))
      (t2/insert! :model/ProductNotification
                  (assoc notification
                         :active true
                         :last_seen_at now)))))

(defn- retire-notification!
  [notification now]
  (when (:active notification)
    (t2/with-transaction [_conn]
      (t2/update! :model/ProductNotification (:id notification)
                  {:active     false
                   :retired_at now}))))

(defn- log-feed-error!
  [{:keys [notification-id phase exception]}]
  (log/warnf exception
             "Skipping product notification %s during %s"
             (or notification-id "<unknown>")
             (name phase)))

(defn- sync-valid-notifications!
  [existing-by-id notifications now]
  (reduce
   (fn [result notification]
     (let [notification-id (:notification_id notification)
           existing        (existing-by-id notification-id)]
       (try
         (sync-notification! existing notification now)
         (-> result
             (update :active-ids conj notification-id)
             (update :synced-count inc))
         (catch Exception e
           (let [phase (:phase (ex-data e) :database)]
             (log/warnf e
                        "Skipping product notification %s during %s"
                        notification-id
                        (name phase))
             (cond-> (update result :error-count inc)
               (= phase :database) (update :protected-ids conj notification-id)))))))
   {:active-ids    #{}
    :protected-ids #{}
    :synced-count  0
    :error-count   0}
   notifications))

(defn- retire-missing-notifications!
  [existing-by-id keep-ids now]
  (reduce
   (fn [error-count notification]
     (if (and (:active notification)
              (not (contains? keep-ids (:notification_id notification))))
       (try
         (retire-notification! notification now)
         error-count
         (catch Exception e
           (log/warnf e
                      "Unable to retire product notification %s"
                      (:notification_id notification))
           (inc error-count)))
       error-count))
   0
   (vals existing-by-id)))

(mu/defn ^:private sync-notifications!
  "Reconcile every valid notification without letting one item block the rest.

  Invalid, unsupported, immutable, and missing IDs become inactive. A database
  failure preserves that item's last known state."
  [{:keys [notifications errors]} :- [:map
                                      [:notifications [:vector :map]]
                                      [:errors [:vector :map]]]]
  (doseq [error errors]
    (log-feed-error! error))
  (let [now            (mi/now)
        existing-by-id (try
                         (t2/select-fn->fn :notification_id identity :model/ProductNotification)
                         (catch Exception e
                           (throw (ex-info "Unable to load product notifications"
                                           {:phase :database}
                                           e))))
        result         (sync-valid-notifications! existing-by-id notifications now)
        keep-ids       (into (:active-ids result) (:protected-ids result))
        retire-errors  (retire-missing-notifications! existing-by-id keep-ids now)]
    (-> result
        (dissoc :active-ids :protected-ids)
        (update :error-count + (count errors) retire-errors))))

(defn sync-from-source!
  "Fetch and reconcile the remote feed, then record the completed sync."
  []
  (let [result (sync-notifications! (fetch/fetch-feed!))]
    (try
      (settings/product-notifications-last-synced-at! (t/offset-date-time))
      (catch Exception e
        (throw (ex-info "Unable to record the product notification sync"
                        {:phase :setting}
                        e))))
    (log/infof "Synced %d product notifications with %d errors"
               (:synced-count result)
               (:error-count result))
    result))

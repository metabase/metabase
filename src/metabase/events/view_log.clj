(ns metabase.events.view-log
  "This namespace is responsible for subscribing to events which should update the view log and view counts."
  (:require
   [metabase.api.common :as api]
   [metabase.events :as events]
   [metabase.models.audit-log :as audit-log]
   [metabase.models.query.permissions :as query-perms]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.util :as u]
   [metabase.util.grouper :as grouper]
   [metabase.util.log :as log]
   [methodical.core :as m]
   [steffan-westcott.clj-otel.api.trace.span :as span]
   [toucan2.core :as t2]))

(defn- group-by-frequency
  "Given a list of items, returns a map of frequencies to items.
    (group-by-frequency [:a :a :b :b :c :c :c])
    ;; => {2 [:a :b] 3 [:c]}"
  [items]
  (reduce (fn [acc [item cnt]]
            (update acc cnt u/conjv item))
          {}
          (frequencies items)))

(defn- increment-view-counts!*
  [items]
  (log/debugf "Increment view counts of %d items" (count items))
  (try
    (let [model->ids (reduce (fn [acc {:keys [id model]}]
                               (update acc model conj id))
                             {}
                             items)]
      (doseq [[model ids] model->ids]
        (let [cnt->ids (group-by-frequency ids)]
          (t2/query {:update (t2/table-name model)
                     :set    {:view_count [:+ :view_count (into [:case]
                                                                (mapcat (fn [[cnt ids]]
                                                                          [[:in :id ids] cnt])
                                                                        cnt->ids))]}
                     :where  [:in :id (apply concat (vals cnt->ids))]}))))
    (catch Exception e
      (log/error e "Failed to increment view counts"))))

(def ^:private increment-view-count-interval-seconds 20)

(defonce ^:private
  increase-view-count-queue
  (delay (grouper/start!
          increment-view-counts!*
          :capacity 500
          :interval (* increment-view-count-interval-seconds 1000))))

(defn- increment-view-counts!
  "Increment the view count of the given `model` and `model-id`."
  [model model-id]
  (grouper/submit! @increase-view-count-queue {:model model :id model-id}))

(defn- record-views!
  "Simple base function for recording a view of a given `model` and `model-id` by a certain `user`."
  [view-or-views]
  (span/with-span!
    {:name "record-view!"}
    (when (premium-features/log-enabled?)
      (t2/insert! :model/ViewLog view-or-views))))

(defn- generate-view
  "Generates a view, given an event map. The event map either has an `object` or a `model` and `object-id`."
  [& {:keys [model object-id object user-id has-access context]
      :or   {has-access true}}]
  {:model      (u/lower-case-en (audit-log/model-name (or model object)))
   :user_id    (or user-id api/*current-user-id*)
   :model_id   (or object-id (u/id object))
   :has_access has-access
   :context    context})

(derive ::card-read-event :metabase/event)
(derive :event/card-read ::card-read-event)

(m/defmethod events/publish-event! ::card-read-event
  "Handle processing for a generic read event notification"
  [topic {:keys [object-id user-id] :as event}]
  (span/with-span!
    {:name    "view-log-card-read"
     :topic   topic
     :user-id user-id}
    (try
      (increment-view-counts! :model/Card object-id)
      (record-views! (generate-view :model :model/Card event))
      (catch Throwable e
        (log/warnf e "Failed to process view event. %s" topic)))))

(derive ::collection-read-event :metabase/event)
(derive :event/collection-read ::collection-read-event)

(m/defmethod events/publish-event! ::collection-read-event
  "Handle processing for a generic read event notification"
  [topic event]
  (try
    (-> event
        generate-view
        record-views!)
    (catch Throwable e
      (log/warnf e "Failed to process view event. %s" topic))))

(derive ::read-permission-failure :metabase/event)
(derive :event/read-permission-failure ::read-permission-failure)

(m/defmethod events/publish-event! ::read-permission-failure
  "Handle processing for a generic read event notification"
  [topic {:keys [object] :as event}]
  (try
    ;; Only log permission check failures for Cards and Dashboards. This set can be expanded if we add view logging of
    ;; other models.
    (when (#{:model/Card :model/Dashboard} (t2/model object))
     (-> event
         generate-view
         record-views!))
    (catch Throwable e
      (log/warnf e "Failed to process view event. %s" topic))))

(derive ::dashboard-read :metabase/event)
(derive :event/dashboard-read ::dashboard-read)

(m/defmethod events/publish-event! ::dashboard-read
  "Handle processing for the dashboard read event. Logs the dashboard view. Card views are logged separately."
  [topic {:keys [object-id user-id] :as event}]
  (span/with-span!
    {:name "view-log-dashboard-read"
     :topic topic
     :user-id user-id}
    (try
      (increment-view-counts! :model/Dashboard object-id)
      (record-views! (generate-view :model :model/Dashboard event))
      (catch Throwable e
        (log/warnf e "Failed to process view event. %s" topic)))))

(derive ::table-read :metabase/event)
(derive :event/table-read ::table-read)

(m/defmethod events/publish-event! ::table-read
  "Handle processing for the table read event. Does a basic permissions check to see if the the user has data perms for
  the table."
  [topic {:keys [object user-id] :as event}]
  (span/with-span!
    {:name "view-log-table-read"
     :topic topic
     :user-id user-id}
    (try
      (increment-view-counts! :model/Table (:id object))
      (let [table-id    (u/id object)
            database-id (:db_id object)
            has-access? (when (= api/*current-user-id* user-id)
                          (query-perms/can-query-table? database-id table-id))]
        (-> event
            (assoc :has-access has-access?)
            generate-view
            record-views!))
      (catch Throwable e
        (log/warnf e "Failed to process view event. %s" topic)))))

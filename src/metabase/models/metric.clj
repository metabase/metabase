(ns metabase.models.metric
  (:require [clojure.core.match :refer [match]]
            [korma.core :as k]
            [medley.core :as m]
            [metabase.config :as config]
            [metabase.db :as db]
            [metabase.events :as events]
            (metabase.models [common :refer [perms-readwrite]]
                             [hydrate :refer :all]
                             [interface :refer :all]
                             [revision :as revision]
                             [user :refer [User]])
            [metabase.util :as u]))


(defrecord MetricInstance []
  ;; preserve normal IFn behavior so things like ((sel :one Database) :id) work correctly
  clojure.lang.IFn
  (invoke [this k]
    (get this k)))

(extend-ICanReadWrite MetricInstance :read :always, :write :superuser)


(defentity Metric
  [(k/table :metric)
   (types :definition :json)
   timestamped]

  (post-select [_ {:keys [creator_id description] :as metric}]
    (map->MetricInstance
      (assoc metric
        :creator     (delay (when creator_id (db/sel :one User :id creator_id)))
        :description (u/jdbc-clob->str description))))

  (pre-cascade-delete [_ {:keys [id]}]
    (if (config/is-prod?)
      ;; in prod we prevent any deleting
      (throw (Exception. "deleting a Metric is not supported."))
      ;; in test we allow deleting
      (db/cascade-delete revision/Revision :model "Metric" :model_id id))))

(extend-ICanReadWrite MetricEntity :read :always, :write :superuser)


;; ## Persistence Functions

(defn create-metric
  "Create a new `Metric`.

   Returns the newly created `Metric` or throws an Exception."
  [table-id name description creator-id definition]
  {:pre [(integer? table-id)
         (string? name)
         (integer? creator-id)
         (map? definition)]}
  (let [metric (db/ins Metric
                  :table_id    table-id
                  :creator_id  creator-id
                  :name        name
                  :description description
                  :is_active   true
                  :definition  definition)]
    (-> (events/publish-event :metric-create metric)
        (hydrate :creator))))

(defn exists-metric?
  "Predicate function which checks for a given `Metric` with ID.
   Returns true if `Metric` exists and is active, false otherwise."
  [id]
  {:pre [(integer? id)]}
  (db/exists? Metric :id id :is_active true))

(defn retrieve-metric
  "Fetch a single `Metric` by its ID value."
  [id]
  {:pre [(integer? id)]}
  (-> (db/sel :one Metric :id id)
      (hydrate :creator)))

(defn retrieve-metrics
  "Fetch all `Metrics` for a given `Table`.  Optional second argument allows filtering by active state by
   providing one of 3 keyword values: `:active`, `:deleted`, `:all`.  Default filtering is for `:active`."
  ([table-id]
   (retrieve-metrics table-id :active))
  ([table-id state]
   {:pre [(integer? table-id)
          (keyword? state)]}
   (-> (if (= :all state)
         (db/sel :many Metric :table_id table-id (k/order :name :ASC))
         (db/sel :many Metric :table_id table-id :is_active (if (= :active state) true false) (k/order :name :ASC)))
       (hydrate :creator))))

(defn update-metric
  "Update an existing `Metric`.

   Returns the updated `Metric` or throws an Exception."
  [{:keys [id name description definition revision_message]} user-id]
  {:pre [(integer? id)
         (string? name)
         (map? definition)
         (integer? user-id)
         (string? revision_message)]}
  ;; update the metric itself
  (db/upd Metric id
    :name        name
    :description description
    :definition  definition)
  (let [metric (retrieve-metric id)]
    ;; fire off an event
    (events/publish-event :metric-update (assoc metric :actor_id user-id :revision_message revision_message))
    ;; return the updated metric
    metric))

(defn delete-metric
  "Delete a `Metric`.

   This does a soft delete and simply marks the `Metric` as deleted but does not actually remove the
   record from the database at any time.

   Returns the final state of the `Metric` is successful, or throws an Exception."
  [id user-id revision-message]
  {:pre [(integer? id)
         (integer? user-id)
         (string? revision-message)]}
  ;; make Metric not active
  (db/upd Metric id :is_active false)
  ;; retrieve the updated metric (now retired)
  (let [metric (retrieve-metric id)]
    ;; fire off an event
    (events/publish-event :metric-delete (assoc metric :actor_id user-id :revision_message revision-message))
    ;; return the updated metric
    metric))


;;; ## ---------------------------------------- REVISIONS ----------------------------------------


(defn- serialize-instance [_ _ instance]
  (->> (dissoc instance :created_at :updated_at)
       (into {})                                 ; if it's a record type like MetricInstance we need to convert it to a regular map or filter-vals won't work
       (m/filter-vals (complement delay?))))

(defn diff-metrics [this metric1 metric2]
  (if-not metric1
    ;; this is the first version of the metric
    (u/update-values (select-keys metric2 [:name :description :definition]) (fn [v] {:after v}))
    ;; do our diff logic
    (let [base-diff (revision/default-diff-map this
                                               (select-keys metric1 [:name :description :definition])
                                               (select-keys metric2 [:name :description :definition]))]
      (cond-> (merge-with merge
                          (u/update-values (:after base-diff) (fn [v] {:after v}))
                          (u/update-values (:before base-diff) (fn [v] {:before v})))
              (or (get-in base-diff [:after :definition])
                  (get-in base-diff [:before :definition])) (assoc :definition {:before (get-in metric1 [:definition])
                                                                                :after  (get-in metric2 [:definition])})))))

(extend MetricEntity
  revision/IRevisioned
  {:serialize-instance serialize-instance
   :revert-to-revision revision/default-revert-to-revision
   :diff-map           diff-metrics
   :diff-str           revision/default-diff-str})

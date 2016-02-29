(ns metabase.models.metric
  (:require [korma.core :as k]
            [metabase.config :as config]
            [metabase.db :as db]
            [metabase.events :as events]
            (metabase.models [common :refer [perms-readwrite]]
                             [dependency :as dependency]
                             [hydrate :refer :all]
                             [interface :as i]
                             [revision :as revision]
                             [user :refer [User]])
            [metabase.query :as q]
            [metabase.util :as u]))


(i/defentity Metric :metric)

(extend (class Metric)
  i/IEntity
  (merge i/IEntityDefaults
         {:types         (constantly {:definition :json, :description :clob})
          :timestamped?  (constantly true)
          :can-read?     (constantly true)
          :can-write?    i/superuser?}))


;;; ## ---------------------------------------- REVISIONS ----------------------------------------


(defn- serialize-metric [_ _ instance]
  (dissoc instance :created_at :updated_at))

(defn- diff-metrics [this metric1 metric2]
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

(extend (class Metric)
  revision/IRevisioned
  (merge revision/IRevisionedDefaults
         {:serialize-instance serialize-metric
          :diff-map           diff-metrics}))


;;; ## ---------------------------------------- DEPENDENCIES ----------------------------------------


(defn metric-dependencies
  "Calculate any dependent objects for a given `Metric`."
  [this id {:keys [definition] :as instance}]
  (when definition
    {:Segment (q/extract-segment-ids definition)}))

(extend (class Metric)
  dependency/IDependent
  {:dependencies metric-dependencies})


;; ## Persistence Functions

(defn create-metric
  "Create a new `Metric`.

   Returns the newly created `Metric` or throws an Exception."
  [table-id metric-name description creator-id definition]
  {:pre [(integer? table-id)
         (string? metric-name)
         (integer? creator-id)
         (map? definition)]}
  (let [metric (db/ins Metric
                  :table_id    table-id
                  :creator_id  creator-id
                  :name        metric-name
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
  (db/exists? Metric :id id, :is_active true))

(defn retrieve-metric
  "Fetch a single `Metric` by its ID value."
  [id]
  {:pre [(integer? id)]}
  (-> (Metric id)
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
         (db/sel :many Metric :table_id table-id, (k/order :name :ASC))
         (db/sel :many Metric :table_id table-id, :is_active (if (= :active state) true false), (k/order :name :ASC)))
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
  (u/prog1 (retrieve-metric id)
    (events/publish-event :metric-update (assoc <> :actor_id user-id, :revision_message revision_message))))

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
  (u/prog1 (retrieve-metric id)
    (events/publish-event :metric-delete (assoc <> :actor_id user-id, :revision_message revision-message))))

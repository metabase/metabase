(ns metabase.models.metric
  (:require [medley.core :as m]
            [metabase
             [events :as events]
             [util :as u]]
            [metabase.models
             [dependency :as dependency]
             [interface :as i]
             [revision :as revision]]
            [metabase.util.query :as q]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]
             [models :as models]]))

(models/defmodel Metric :metric)

(defn- pre-delete [{:keys [id]}]
  (db/delete! 'MetricImportantField :metric_id id))

(defn- perms-objects-set [metric read-or-write]
  (let [table (or (:table metric)
                  (db/select-one ['Table :db_id :schema :id] :id (:table_id metric)))]
    (i/perms-objects-set table read-or-write)))

(u/strict-extend (class Metric)
  models/IModel
  (merge models/IModelDefaults
         {:types      (constantly {:definition :json, :description :clob})
          :properties (constantly {:timestamped? true})
          :pre-delete pre-delete})
  i/IObjectPermissions
  (merge i/IObjectPermissionsDefaults
         {:perms-objects-set perms-objects-set
          :can-read?         (partial i/current-user-has-full-permissions? :read)
          :can-write?        (partial i/current-user-has-full-permissions? :write)}))


;;; ## ---------------------------------------- REVISIONS ----------------------------------------


(defn- serialize-metric [_ _ instance]
  (dissoc instance :created_at :updated_at))

(defn- diff-metrics [this metric1 metric2]
  (if-not metric1
    ;; this is the first version of the metric
    (m/map-vals (fn [v] {:after v}) (select-keys metric2 [:name :description :definition]))
    ;; do our diff logic
    (let [base-diff (revision/default-diff-map this
                                               (select-keys metric1 [:name :description :definition])
                                               (select-keys metric2 [:name :description :definition]))]
      (cond-> (merge-with merge
                (m/map-vals (fn [v] {:after v}) (:after base-diff))
                (m/map-vals (fn [v] {:before v}) (:before base-diff)))
        (or (get-in base-diff [:after :definition])
            (get-in base-diff [:before :definition])) (assoc :definition {:before (get-in metric1 [:definition])
                                                                          :after  (get-in metric2 [:definition])})))))

(u/strict-extend (class Metric)
  revision/IRevisioned
  (merge revision/IRevisionedDefaults
         {:serialize-instance serialize-metric
          :diff-map           diff-metrics}))


;;; ## ---------------------------------------- DEPENDENCIES ----------------------------------------


(defn metric-dependencies
  "Calculate any dependent objects for a given `Metric`."
  [_ _ {:keys [definition]}]
  (when definition
    {:Segment (q/extract-segment-ids definition)}))

(u/strict-extend (class Metric)
  dependency/IDependent
  {:dependencies metric-dependencies})


;; ## Persistence Functions

(defn create-metric!
  "Create a new `Metric`.

   Returns the newly created `Metric` or throws an Exception."
  [table-id metric-name description creator-id definition]
  {:pre [(integer? table-id)
         (string? metric-name)
         (integer? creator-id)
         (map? definition)]}
  (let [metric (db/insert! Metric
                 :table_id    table-id
                 :creator_id  creator-id
                 :name        metric-name
                 :description description
                 :definition  definition)]
    (-> (events/publish-event! :metric-create metric)
        (hydrate :creator))))

(defn exists?
  "Does an *active* `Metric` with ID exist?"
  ^Boolean [id]
  {:pre [(integer? id)]}
  (db/exists? Metric :id id, :archived false))

(defn retrieve-metric
  "Fetch a single `Metric` by its ID value. Hydrates its `:creator`."
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
   {:pre [(integer? table-id) (keyword? state)]}
   (-> (db/select Metric
         {:where    [:and [:= :table_id table-id]
                          (case state
                            :all     true
                            :active  [:= :archived false]
                            :deleted [:= :archived true])]
          :order-by [[:name :asc]]})
       (hydrate :creator))))

(defn update-metric!
  "Update an existing `Metric`.

   Returns the updated `Metric` or throws an Exception."
  [{:keys [id name definition revision_message], :as body} user-id]
  {:pre [(integer? id)
         (string? name)
         (map? definition)
         (integer? user-id)
         (string? revision_message)]}
  ;; update the metric itself
  (db/update! Metric id
    (select-keys body #{:caveats :definition :description :how_is_this_calculated :name :points_of_interest :show_in_getting_started}))
  (u/prog1 (retrieve-metric id)
    (events/publish-event! :metric-update (assoc <> :actor_id user-id, :revision_message revision_message))))

;; TODO - rename to `delete!`
(defn delete-metric!
  "Delete a `Metric`.

   This does a soft delete and simply marks the `Metric` as deleted but does not actually remove the
   record from the database at any time.

   Returns the final state of the `Metric` is successful, or throws an Exception."
  [id user-id revision-message]
  {:pre [(integer? id)
         (integer? user-id)
         (string? revision-message)]}
  ;; make Metric not active
  (db/update! Metric id, :archived true)
  ;; retrieve the updated metric (now retired)
  (u/prog1 (retrieve-metric id)
    (events/publish-event! :metric-delete (assoc <> :actor_id user-id, :revision_message revision-message))))

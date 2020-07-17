(ns metabase.models.metric
  "A Metric is a saved MBQL 'macro' expanding to a combination of `:aggregation` and/or `:filter` clauses.
  It is passed in as an `:aggregation` clause but is replaced by the `expand-macros` middleware with the appropriate
  clauses."
  (:require [medley.core :as m]
            [metabase.mbql.util :as mbql.u]
            [metabase.models
             [dependency :as dependency]
             [interface :as i]
             [revision :as revision]]
            [metabase.util :as u]
            [metabase.util
             [i18n :refer [tru]]
             [schema :as su]]
            [schema.core :as s]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]
             [models :as models]]))

(models/defmodel Metric :metric)

(defn- pre-update [{:keys [creator_id id], :as updates}]
  (u/prog1 updates
    ;; throw an Exception if someone tries to update creator_id
    (when (contains? updates :creator_id)
      (when (not= creator_id (db/select-one-field :creator_id Metric :id id))
        (throw (UnsupportedOperationException. (tru "You cannot update the creator_id of a Metric.")))))))

(defn- perms-objects-set [metric read-or-write]
  (let [table (or (:table metric)
                  (db/select-one ['Table :db_id :schema :id] :id (u/get-id (:table_id metric))))]
    (i/perms-objects-set table read-or-write)))

(u/strict-extend (class Metric)
  models/IModel
  (merge
   models/IModelDefaults
   {:types      (constantly {:definition :metric-segment-definition})
    :properties (constantly {:timestamped? true})
    :pre-update pre-update})
  i/IObjectPermissions
  (merge
   i/IObjectPermissionsDefaults
   {:perms-objects-set perms-objects-set
    :can-read?         (partial i/current-user-has-full-permissions? :read)
    ;; for the time being you need to be a superuser in order to create or update Metrics because the UI for doing so
    ;; is only exposed in the admin panel
    :can-write?        i/superuser?
    :can-create?       i/superuser?}))


;;; --------------------------------------------------- REVISIONS ----------------------------------------------------

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


;;; -------------------------------------------------- DEPENDENCIES --------------------------------------------------

(defn metric-dependencies
  "Calculate any dependent objects for a given Metric."
  [_ _ {:keys [definition]}]
  (when definition
    {:Segment (set (mbql.u/match definition [:segment id] id))}))

(u/strict-extend (class Metric)
  dependency/IDependent
  {:dependencies metric-dependencies})


;;; ----------------------------------------------------- OTHER ------------------------------------------------------

(s/defn retrieve-metrics :- [MetricInstance]
  "Fetch all `Metrics` for a given `Table`. Optional second argument allows filtering by active state by providing one
  of 3 keyword values: `:active`, `:deleted`, `:all`. Default filtering is for `:active`."
  ([table-id :- su/IntGreaterThanZero]
   (retrieve-metrics table-id :active))

  ([table-id :- su/IntGreaterThanZero, state :- (s/enum :all :active :deleted)]
   (-> (db/select Metric
         {:where    [:and [:= :table_id table-id]
                     (case state
                       :all     true
                       :active  [:= :archived false]
                       :deleted [:= :archived true])]
          :order-by [[:name :asc]]})
       (hydrate :creator))))

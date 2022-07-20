(ns metabase.models.metric
  "A Metric is a saved MBQL 'macro' expanding to a combination of `:aggregation` and/or `:filter` clauses.
  It is passed in as an `:aggregation` clause but is replaced by the `expand-macros` middleware with the appropriate
  clauses."
  (:require [medley.core :as m]
            [metabase.mbql.util :as mbql.u]
            [metabase.models.dependency :as dependency :refer [Dependency]]
            [metabase.models.interface :as mi]
            [metabase.models.revision :as revision]
            [metabase.models.serialization.base :as serdes.base]
            [metabase.models.serialization.hash :as serdes.hash]
            [metabase.models.serialization.util :as serdes.util]
            [metabase.util :as u]
            [metabase.util.i18n :refer [tru]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]
            [toucan.hydrate :refer [hydrate]]
            [toucan.models :as models]))

(models/defmodel Metric :metric)

(defn- pre-delete [{:keys [id]}]
  (db/delete! Dependency :model "Metric", :model_id id))

(defn- pre-update [{:keys [creator_id id], :as updates}]
  (u/prog1 updates
    ;; throw an Exception if someone tries to update creator_id
    (when (contains? updates :creator_id)
      (when (not= creator_id (db/select-one-field :creator_id Metric :id id))
        (throw (UnsupportedOperationException. (tru "You cannot update the creator_id of a Metric.")))))))

(defn- perms-objects-set [metric read-or-write]
  (let [table (or (:table metric)
                  (db/select-one ['Table :db_id :schema :id] :id (u/the-id (:table_id metric))))]
    (mi/perms-objects-set table read-or-write)))

(u/strict-extend (class Metric)
  models/IModel
  (merge
   models/IModelDefaults
   {:types      (constantly {:definition :metric-segment-definition})
    :properties (constantly {:timestamped? true
                             :entity_id    true})
    :pre-update pre-update
    :pre-delete pre-delete})
  mi/IObjectPermissions
  (merge
   mi/IObjectPermissionsDefaults
   {:perms-objects-set perms-objects-set
    :can-read?         (partial mi/current-user-has-full-permissions? :read)
    ;; for the time being you need to be a superuser in order to create or update Metrics because the UI for doing so
    ;; is only exposed in the admin panel
    :can-write?        mi/superuser?
    :can-create?       mi/superuser?})

  serdes.hash/IdentityHashable
  {:identity-hash-fields (constantly [:name (serdes.hash/hydrated-hash :table)])})


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

;;; ------------------------------------------------- SERIALIZATION --------------------------------------------------

(defmethod serdes.base/serdes-generate-path "Metric"
  [_ metric]
  (let [base (serdes.base/infer-self-path "Metric" metric)]
    [(assoc base :label (:name metric))]))

(defmethod serdes.base/extract-one "Metric"
  [_model-name _opts metric]
  (-> (serdes.base/extract-one-basics "Metric" metric)
      (update :table_id   serdes.util/export-table-fk)
      (update :creator_id serdes.util/export-fk-keyed 'User :email)))

(defmethod serdes.base/load-xform "Metric" [metric]
  (-> metric
      serdes.base/load-xform-basics
      (update :table_id   serdes.util/import-table-fk)
      (update :creator_id serdes.util/import-fk-keyed 'User :email)))

(defmethod serdes.base/serdes-dependencies "Metric" [{:keys [table_id]}]
  [(serdes.util/table->path table_id)])

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

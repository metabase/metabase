(ns metabase.models.metric
  "A Metric is a saved MBQL 'macro' expanding to a combination of `:aggregation` and/or `:filter` clauses.
  It is passed in as an `:aggregation` clause but is replaced by the `expand-macros` middleware with the appropriate
  clauses."
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.models.interface :as mi]
   [metabase.models.revision :as revision]
   [metabase.models.serialization.base :as serdes.base]
   [metabase.models.serialization.hash :as serdes.hash]
   [metabase.models.serialization.util :as serdes.util]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [toucan.db :as db]
   [toucan.models :as models]))

(models/defmodel Metric :metric)

(doto Metric
  (derive ::mi/read-policy.full-perms-for-perms-set)
  (derive ::mi/write-policy.superuser)
  (derive ::mi/create-policy.superuser))

(defn- pre-update [{:keys [creator_id id], :as updates}]
  (u/prog1 updates
    ;; throw an Exception if someone tries to update creator_id
    (when (contains? updates :creator_id)
      (when (not= creator_id (db/select-one-field :creator_id Metric :id id))
        (throw (UnsupportedOperationException. (tru "You cannot update the creator_id of a Metric.")))))))

(defmethod mi/perms-objects-set Metric
  [metric read-or-write]
  (let [table (or (:table metric)
                  (db/select-one ['Table :db_id :schema :id] :id (u/the-id (:table_id metric))))]
    (mi/perms-objects-set table read-or-write)))

(mi/define-methods
 Metric
 {:types      (constantly {:definition :metric-segment-definition})
  :properties (constantly {::mi/timestamped? true
                           ::mi/entity-id    true})
  :pre-update pre-update})

(defmethod serdes.hash/identity-hash-fields Metric
  [_metric]
  [:name (serdes.hash/hydrated-hash :table "<none>") :created_at])


;;; --------------------------------------------------- REVISIONS ----------------------------------------------------

(defmethod revision/serialize-instance Metric
  [_model _id instance]
  (dissoc instance :created_at :updated_at))

(defmethod revision/diff-map Metric
  [model metric1 metric2]
  (if-not metric1
    ;; model is the first version of the metric
    (m/map-vals (fn [v] {:after v}) (select-keys metric2 [:name :description :definition]))
    ;; do our diff logic
    (let [base-diff ((get-method revision/diff-map :default)
                     model
                     (select-keys metric1 [:name :description :definition])
                     (select-keys metric2 [:name :description :definition]))]
      (cond-> (merge-with merge
                          (m/map-vals (fn [v] {:after v}) (:after base-diff))
                          (m/map-vals (fn [v] {:before v}) (:before base-diff)))
        (or (get-in base-diff [:after :definition])
            (get-in base-diff [:before :definition])) (assoc :definition {:before (get-in metric1 [:definition])
                                                                          :after  (get-in metric2 [:definition])})))))


;;; ------------------------------------------------- SERIALIZATION --------------------------------------------------
(defmethod serdes.base/extract-one "Metric"
  [_model-name _opts metric]
  (-> (serdes.base/extract-one-basics "Metric" metric)
      (update :table_id   serdes.util/export-table-fk)
      (update :creator_id serdes.util/export-user)
      (update :definition serdes.util/export-mbql)))

(defmethod serdes.base/load-xform "Metric" [metric]
  (-> metric
      serdes.base/load-xform-basics
      (update :table_id   serdes.util/import-table-fk)
      (update :creator_id serdes.util/import-user)
      (update :definition serdes.util/import-mbql)))

(defmethod serdes.base/serdes-dependencies "Metric" [{:keys [definition table_id]}]
  (into [] (set/union #{(serdes.util/table->path table_id)}
                      (serdes.util/mbql-deps definition))))

(defmethod serdes.base/storage-path "Metric" [metric _ctx]
  (let [{:keys [id label]} (-> metric serdes.base/serdes-path last)]
    (-> metric
        :table_id
        serdes.util/table->path
        serdes.util/storage-table-path-prefix
        (concat ["metrics" (serdes.base/storage-leaf-file-name id label)]))))

(serdes.base/register-ingestion-path! "Metric" (serdes.base/ingestion-matcher-collected "databases" "Metric"))

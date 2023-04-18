(ns metabase.models.segment
  "A Segment is a saved MBQL 'macro', expanding to a `:filter` subclause. It is passed in as a `:filter` subclause but is
  replaced by the `expand-macros` middleware with the appropriate clauses."
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.models.interface :as mi]
   [metabase.models.revision :as revision]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [toucan.db :as db]
   [toucan.models :as models]))

(models/defmodel Segment :segment)

(doto Segment
  (derive ::mi/read-policy.full-perms-for-perms-set)
  (derive ::mi/write-policy.superuser)
  (derive ::mi/create-policy.superuser))

(defn- pre-update [{:keys [creator_id id], :as updates}]
  (u/prog1 updates
    ;; throw an Exception if someone tries to update creator_id
    (when (contains? updates :creator_id)
      (when (not= creator_id (db/select-one-field :creator_id Segment :id id))
        (throw (UnsupportedOperationException. (tru "You cannot update the creator_id of a Segment.")))))))

(defmethod mi/perms-objects-set Segment
  [segment read-or-write]
  (let [table (or (:table segment)
                  (db/select-one ['Table :db_id :schema :id] :id (u/the-id (:table_id segment))))]
    (mi/perms-objects-set table read-or-write)))

(mi/define-methods
 Segment
 {:types          (constantly {:definition :metric-segment-definition})
  :properties     (constantly {::mi/timestamped? true
                               ::mi/entity-id    true})
  :hydration-keys (constantly [:segment])
  :pre-update     pre-update})

(defmethod serdes/hash-fields Segment
  [_segment]
  [:name (serdes/hydrated-hash :table) :created_at])


;;; --------------------------------------------------- Revisions ----------------------------------------------------

(defmethod revision/serialize-instance Segment
  [_model _id instance]
  (dissoc instance :created_at :updated_at))

(defmethod revision/diff-map Segment
  [model segment1 segment2]
  (if-not segment1
    ;; this is the first version of the segment
    (m/map-vals (fn [v] {:after v}) (select-keys segment2 [:name :description :definition]))
    ;; do our diff logic
    (let [base-diff ((get-method revision/diff-map :default)
                     model
                     (select-keys segment1 [:name :description :definition])
                     (select-keys segment2 [:name :description :definition]))]
      (cond-> (merge-with merge
                          (m/map-vals (fn [v] {:after v}) (:after base-diff))
                          (m/map-vals (fn [v] {:before v}) (:before base-diff)))
        (or (get-in base-diff [:after :definition])
            (get-in base-diff [:before :definition])) (assoc :definition {:before (get-in segment1 [:definition])
                                                                          :after  (get-in segment2 [:definition])})))))


;;; ------------------------------------------------ Serialization ---------------------------------------------------
(defmethod serdes/extract-one "Segment"
  [_model-name _opts segment]
  (-> (serdes/extract-one-basics "Segment" segment)
      (update :table_id   serdes/*export-table-fk*)
      (update :creator_id serdes/*export-user*)
      (update :definition serdes/export-mbql)))

(defmethod serdes/load-xform "Segment" [segment]
  (-> segment
      serdes/load-xform-basics
      (update :table_id   serdes/*import-table-fk*)
      (update :creator_id serdes/*import-user*)
      (update :definition serdes/import-mbql)))

(defmethod serdes/dependencies "Segment" [{:keys [definition table_id]}]
  (into [] (set/union #{(serdes/table->path table_id)}
                      (serdes/mbql-deps definition))))

(defmethod serdes/storage-path "Segment" [segment _ctx]
  (let [{:keys [id label]} (-> segment serdes/path last)]
    (-> segment
        :table_id
        serdes/table->path
        serdes/storage-table-path-prefix
        (concat ["segments" (serdes/storage-leaf-file-name id label)]))))

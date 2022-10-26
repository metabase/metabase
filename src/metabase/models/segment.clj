(ns metabase.models.segment
  "A Segment is a saved MBQL 'macro', expanding to a `:filter` subclause. It is passed in as a `:filter` subclause but is
  replaced by the `expand-macros` middleware with the appropriate clauses."
  (:require [clojure.set :as set]
            [medley.core :as m]
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

(u/strict-extend #_{:clj-kondo/ignore [:metabase/disallow-class-or-type-on-model]} (class Segment)
  models/IModel
  (merge
   models/IModelDefaults
   {:types          (constantly {:definition :metric-segment-definition})
    :properties     (constantly {:timestamped? true
                                 :entity_id    true})
    :hydration-keys (constantly [:segment])
    :pre-update     pre-update}))

(defmethod serdes.hash/identity-hash-fields Segment
  [_segment]
  [:name (serdes.hash/hydrated-hash :table) :created_at])


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

(defmethod serdes.base/serdes-generate-path "Segment"
  [_ segment]
  [(assoc (serdes.base/infer-self-path "Segment" segment)
          :label (:name segment))])

(defmethod serdes.base/extract-one "Segment"
  [_model-name _opts segment]
  (-> (serdes.base/extract-one-basics "Segment" segment)
      (update :table_id   serdes.util/export-table-fk)
      (update :creator_id serdes.util/export-user)
      (update :definition serdes.util/export-mbql)))

(defmethod serdes.base/load-xform "Segment" [segment]
  (-> segment
      serdes.base/load-xform-basics
      (update :table_id   serdes.util/import-table-fk)
      (update :creator_id serdes.util/import-user)
      (update :definition serdes.util/import-mbql)))

(defmethod serdes.base/serdes-dependencies "Segment" [{:keys [definition table_id]}]
  (into [] (set/union #{(serdes.util/table->path table_id)}
                      (serdes.util/mbql-deps definition))))

;;; ------------------------------------------------------ Etc. ------------------------------------------------------

(s/defn retrieve-segments :- [(mi/InstanceOf Segment)]
  "Fetch all `Segments` for a given `Table`. Optional second argument allows filtering by active state by providing
   one of 3 keyword values: `:active`, `:deleted`, `:all`. Default filtering is for `:active`."
  ([table-id :- su/IntGreaterThanZero]
   (retrieve-segments table-id :active))

  ([table-id :- su/IntGreaterThanZero state :- (s/enum :active :deleted :all)]
   (-> (if (= :all state)
         (db/select Segment, :table_id table-id, {:order-by [[:name :asc]]})
         (db/select Segment, :table_id table-id, :archived (= :deleted state), {:order-by [[:name :asc]]}))
       (hydrate :creator))))

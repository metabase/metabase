(ns metabase.models.segment
  "A Segment is a saved MBQL 'macro', expanding to a `:filter` subclause. It is passed in as a `:filter` subclause but is
  replaced by the `expand-macros` middleware with the appropriate clauses."
  (:require [medley.core :as m]
            [metabase.models
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

(models/defmodel Segment :segment)

(defn- pre-update [{:keys [creator_id id], :as updates}]
  (u/prog1 updates
    ;; throw an Exception if someone tries to update creator_id
    (when (contains? updates :creator_id)
      (when (not= creator_id (db/select-one-field :creator_id Segment :id id))
        (throw (UnsupportedOperationException. (tru "You cannot update the creator_id of a Segment.")))))))

(defn- perms-objects-set [segment read-or-write]
  (let [table (or (:table segment)
                  (db/select-one ['Table :db_id :schema :id] :id (u/get-id (:table_id segment))))]
    (i/perms-objects-set table read-or-write)))

(u/strict-extend (class Segment)
  models/IModel
  (merge
   models/IModelDefaults
   {:types          (constantly {:definition :metric-segment-definition})
    :properties     (constantly {:timestamped? true})
    :hydration-keys (constantly [:segment])
    :pre-update     pre-update})
  i/IObjectPermissions
  (merge
   i/IObjectPermissionsDefaults
   {:perms-objects-set perms-objects-set
    :can-read?         (partial i/current-user-has-full-permissions? :read)
    ;; for the time being you need to be a superuser in order to create or update Segments because the UI for
    ;; doing so is only exposed in the admin panel
    :can-write?        i/superuser?
    :can-create?       i/superuser?}))


;;; --------------------------------------------------- Revisions ----------------------------------------------------

(defn- serialize-segment [_ _ instance]
  (dissoc instance :created_at :updated_at))

(defn- diff-segments [this segment1 segment2]
  (if-not segment1
    ;; this is the first version of the segment
    (m/map-vals (fn [v] {:after v}) (select-keys segment2 [:name :description :definition]))
    ;; do our diff logic
    (let [base-diff (revision/default-diff-map this
                                               (select-keys segment1 [:name :description :definition])
                                               (select-keys segment2 [:name :description :definition]))]
      (cond-> (merge-with merge
                          (m/map-vals (fn [v] {:after v}) (:after base-diff))
                          (m/map-vals (fn [v] {:before v}) (:before base-diff)))
              (or (get-in base-diff [:after :definition])
                  (get-in base-diff [:before :definition])) (assoc :definition {:before (get-in segment1 [:definition])
                                                                                :after  (get-in segment2 [:definition])})))))


(u/strict-extend (class Segment)
  revision/IRevisioned
  (merge
   revision/IRevisionedDefaults
   {:serialize-instance serialize-segment
    :diff-map           diff-segments}))


;;; ------------------------------------------------------ Etc. ------------------------------------------------------

(s/defn retrieve-segments :- [SegmentInstance]
  "Fetch all `Segments` for a given `Table`. Optional second argument allows filtering by active state by providing
   one of 3 keyword values: `:active`, `:deleted`, `:all`. Default filtering is for `:active`."
  ([table-id :- su/IntGreaterThanZero]
   (retrieve-segments table-id :active))

  ([table-id :- su/IntGreaterThanZero state :- (s/enum :active :deleted :all)]
   (-> (if (= :all state)
         (db/select Segment, :table_id table-id, {:order-by [[:name :asc]]})
         (db/select Segment, :table_id table-id, :archived (= :deleted state), {:order-by [[:name :asc]]}))
       (hydrate :creator))))

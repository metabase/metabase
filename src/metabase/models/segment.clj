(ns metabase.models.segment
  (:require [korma.core :as k]
            [metabase.db :as db]
            [metabase.events :as events]
            (metabase.models [common :refer [perms-readwrite]]
                             [hydrate :refer :all]
                             [interface :as i]
                             [revision :as revision]
                             [user :refer [User]])
            [metabase.util :as u]))


(i/defentity Segment :segment)

(extend (class Segment)
  i/IEntity
  (merge i/IEntityDefaults
         {:types           (constantly {:definition :json, :description :clob})
          :timestamped?    (constantly true)
          :hydration-keys  (constantly [:segment])
          :can-read?       (constantly true)
          :can-write?      i/superuser?}))


;;; ## ---------------------------------------- REVISIONS ----------------------------------------


(defn- serialize-segment [_ _ instance]
  (dissoc instance :created_at :updated_at))

(defn- diff-segments [this segment1 segment2]
  (if-not segment1
    ;; this is the first version of the segment
    (u/update-values (select-keys segment2 [:name :description :definition]) (fn [v] {:after v}))
    ;; do our diff logic
    (let [base-diff (revision/default-diff-map this
                                               (select-keys segment1 [:name :description :definition])
                                               (select-keys segment2 [:name :description :definition]))]
      (cond-> (merge-with merge
                          (u/update-values (:after base-diff) (fn [v] {:after v}))
                          (u/update-values (:before base-diff) (fn [v] {:before v})))
              (or (get-in base-diff [:after :definition])
                  (get-in base-diff [:before :definition])) (assoc :definition {:before (get-in segment1 [:definition])
                                                                                :after  (get-in segment2 [:definition])})))))


(extend (class Segment)
  revision/IRevisioned
  (merge revision/IRevisionedDefaults
         {:serialize-instance serialize-segment
          :diff-map           diff-segments}))


;; ## Persistence Functions

(defn create-segment
  "Create a new `Segment`.

   Returns the newly created `Segment` or throws an Exception."
  [table-id segment-name description creator-id definition]
  {:pre [(integer? table-id)
         (string? segment-name)
         (integer? creator-id)
         (map? definition)]}
  (let [segment (db/ins Segment
                  :table_id    table-id
                  :creator_id  creator-id
                  :name        segment-name
                  :description description
                  :is_active   true
                  :definition  definition)]
    (-> (events/publish-event :segment-create segment)
        (hydrate :creator))))

(defn exists-segment?
  "Predicate function which checks for a given `Segment` with ID.
   Returns true if `Segment` exists and is active, false otherwise."
  [id]
  {:pre [(integer? id)]}
  (db/exists? Segment :id id :is_active true))

(defn retrieve-segment
  "Fetch a single `Segment` by its ID value."
  [id]
  {:pre [(integer? id)]}
  (-> (db/sel :one Segment :id id)
      (hydrate :creator)))

(defn retrieve-segments
  "Fetch all `Segments` for a given `Table`.  Optional second argument allows filtering by active state by
   providing one of 3 keyword values: `:active`, `:deleted`, `:all`.  Default filtering is for `:active`."
  ([table-id]
    (retrieve-segments table-id :active))
  ([table-id state]
   {:pre [(integer? table-id)
          (keyword? state)]}
   (-> (if (= :all state)
         (db/sel :many Segment :table_id table-id (k/order :name :ASC))
         (db/sel :many Segment :table_id table-id :is_active (if (= :active state) true false) (k/order :name :ASC)))
       (hydrate :creator))))

(defn update-segment
  "Update an existing `Segment`.

   Returns the updated `Segment` or throws an Exception."
  [{:keys [id name description definition revision_message]} user-id]
  {:pre [(integer? id)
         (string? name)
         (map? definition)
         (integer? user-id)
         (string? revision_message)]}
  ;; update the segment itself
  (db/upd Segment id
    :name        name
    :description description
    :definition  definition)
  (let [segment (retrieve-segment id)]
    ;; fire off an event
    (events/publish-event :segment-update (assoc segment :actor_id user-id :revision_message revision_message))
    ;; return the updated segment
    segment))

(defn delete-segment
  "Delete a `Segment`.

   This does a soft delete and simply marks the `Segment` as deleted but does not actually remove the
   record from the database at any time.

   Returns the final state of the `Segment` is successful, or throws an Exception."
  [id user-id revision-message]
  {:pre [(integer? id)
         (integer? user-id)
         (string? revision-message)]}
  ;; make Segment not active
  (db/upd Segment id :is_active false)
  ;; retrieve the updated segment (now retired)
  (let [segment (retrieve-segment id)]
    ;; fire off an event
    (events/publish-event :segment-delete (assoc segment :actor_id user-id :revision_message revision-message))
    ;; return the updated segment
    segment))

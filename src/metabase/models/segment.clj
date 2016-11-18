(ns metabase.models.segment
  (:require [medley.core :as m]
            [metabase.db :as db]
            [metabase.events :as events]
            (metabase.models [hydrate :refer [hydrate]]
                             [interface :as i]
                             [revision :as revision])
            [metabase.util :as u]))


(i/defentity Segment :segment)

(defn- perms-objects-set [segment read-or-write]
  (let [table (or (:table segment)
                  (db/select-one ['Table :db_id :schema :id] :id (:table_id segment)))]
    (i/perms-objects-set table read-or-write)))

(u/strict-extend (class Segment)
  i/IEntity
  (merge i/IEntityDefaults
         {:types             (constantly {:definition :json, :description :clob})
          :timestamped?      (constantly true)
          :hydration-keys    (constantly [:segment])
          :perms-objects-set perms-objects-set
          :can-read?         (partial i/current-user-has-full-permissions? :read)
          :can-write?        (partial i/current-user-has-full-permissions? :write)}))


;;; ## ---------------------------------------- REVISIONS ----------------------------------------


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
  (merge revision/IRevisionedDefaults
         {:serialize-instance serialize-segment
          :diff-map           diff-segments}))


;; ## Persistence Functions

(defn create-segment!
  "Create a new `Segment`.

   Returns the newly created `Segment` or throws an Exception."
  [table-id segment-name description creator-id definition]
  {:pre [(integer? table-id)
         (string? segment-name)
         (integer? creator-id)
         (map? definition)]}
  (let [segment (db/insert! Segment
                  :table_id    table-id
                  :creator_id  creator-id
                  :name        segment-name
                  :description description
                  :is_active   true
                  :definition  definition)]
    (-> (events/publish-event! :segment-create segment)
        (hydrate :creator))))

(defn exists?
  "Does an *active* `Segment` with ID exist?"
  ^Boolean [id]
  {:pre [(integer? id)]}
  (db/exists? Segment, :id id, :is_active true))

(defn retrieve-segment
  "Fetch a single `Segment` by its ID value. Hydrates the Segment's `:creator`."
  [id]
  {:pre [(integer? id)]}
  (-> (Segment id)
      (hydrate :creator)))

(defn retrieve-segments
  "Fetch all `Segments` for a given `Table`.  Optional second argument allows filtering by active state by
   providing one of 3 keyword values: `:active`, `:deleted`, `:all`.  Default filtering is for `:active`."
  ([table-id]
    (retrieve-segments table-id :active))
  ([table-id state]
   {:pre [(integer? table-id) (keyword? state)]}
   (-> (if (= :all state)
         (db/select Segment, :table_id table-id, {:order-by [[:name :asc]]})
         (db/select Segment, :table_id table-id, :is_active (= :active state), {:order-by [[:name :asc]]}))
       (hydrate :creator))))

(defn update-segment!
  "Update an existing `Segment`.
   Returns the updated `Segment` or throws an Exception."
  {:style/indent 0}
  [{:keys [id name description caveats points_of_interest show_in_getting_started definition revision_message]} user-id]
  {:pre [(integer? id)
         (string? name)
         (map? definition)
         (integer? user-id)
         (string? revision_message)]}
  ;; update the segment itself
  (db/update! Segment id
    (merge
     {:name        name
      :description description
      :caveats     caveats
      :definition  definition}
     (when (seq points_of_interest)
       {:points_of_interest points_of_interest})
     (when (not (nil? show_in_getting_started))
       {:show_in_getting_started show_in_getting_started})))
  (u/prog1 (retrieve-segment id)
    (events/publish-event! :segment-update (assoc <> :actor_id user-id, :revision_message revision_message))))

(defn delete-segment!
  "Delete a `Segment`.

   This does a soft delete and simply marks the `Segment` as deleted but does not actually remove the
   record from the database at any time.

   Returns the final state of the `Segment` is successful, or throws an Exception."
  [id user-id revision-message]
  {:pre [(integer? id)
         (integer? user-id)
         (string? revision-message)]}
  ;; make Segment not active
  (db/update! Segment id, :is_active false)
  ;; retrieve the updated segment (now retired)
  (u/prog1 (retrieve-segment id)
    (events/publish-event! :segment-delete (assoc <> :actor_id user-id, :revision_message revision-message))))

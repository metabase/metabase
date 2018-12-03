(ns metabase.models.segment
  "A Segment is a saved MBQL 'macro', expanding to a `:filter` subclause. It is passed in as a `:filter` subclause but is
  replaced by the `expand-macros` middleware with the appropriate clauses."
  (:require [medley.core :as m]
            [metabase
             [events :as events]
             [util :as u]]
            [metabase.models
             [interface :as i]
             [revision :as revision]]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]
             [models :as models]]))

(models/defmodel Segment :segment)

(defn- perms-objects-set [segment read-or-write]
  (let [table (or (:table segment)
                  (db/select-one ['Table :db_id :schema :id] :id (:table_id segment)))]
    (i/perms-objects-set table read-or-write)))

(u/strict-extend (class Segment)
  models/IModel
  (merge models/IModelDefaults
         {:types          (constantly {:definition :metric-segment-definition, :description :clob})
          :properties     (constantly {:timestamped? true})
          :hydration-keys (constantly [:segment])})
  i/IObjectPermissions
  (merge i/IObjectPermissionsDefaults
         {:perms-objects-set perms-objects-set
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
                  :definition  definition)]
    (-> (events/publish-event! :segment-create segment)
        (hydrate :creator))))

(defn exists?
  "Does an *active* `Segment` with ID exist?"
  ^Boolean [id]
  {:pre [(integer? id)]}
  (db/exists? Segment, :id id, :archived false))

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
         (db/select Segment, :table_id table-id, :archived (= :deleted state), {:order-by [[:name :asc]]}))
       (hydrate :creator))))

(defn update-segment!
  "Update an existing `Segment`.
   Returns the updated `Segment` or throws an Exception."
  [{:keys [id name description caveats points_of_interest show_in_getting_started definition revision_message]
    :as   body}
   user-id]
  {:pre [(integer? id)
         (string? name)
         (map? definition)
         (integer? user-id)
         (string? revision_message)]}
  ;; update the segment itself
  (db/update! Segment id
    (u/select-keys-when body
      :present #{:name :description :caveats :definition}
      :non-nil #{:points_of_interest :show_in_getting_started}))
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
  (db/update! Segment id, :archived true)
  ;; retrieve the updated segment (now retired)
  (u/prog1 (retrieve-segment id)
    (events/publish-event! :segment-delete (assoc <> :actor_id user-id, :revision_message revision-message))))

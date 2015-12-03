(ns metabase.models.segment
  (:require [clojure.tools.logging :as log]
            [korma.core :as k]
            [korma.db :as kdb]
            [metabase.config :as config]
            [metabase.db :as db]
            [metabase.events :as events]
            (metabase.models [common :refer [perms-readwrite]]
                             [hydrate :refer :all]
                             [interface :refer :all]
                             [user :refer [User]])
            [metabase.util :as u]))


(defrecord SegmentInstance []
  ;; preserve normal IFn behavior so things like ((sel :one Database) :id) work correctly
  clojure.lang.IFn
  (invoke [this k]
    (get this k)))

(extend-ICanReadWrite SegmentInstance :read :always, :write :superuser)


(defentity Segment
  [(k/table :segment)
   (hydration-keys segment)
   (types :definition :json)
   timestamped]

  (post-insert [_ segment]
    (events/publish-event :segment-create segment))

  (post-select [_ {:keys [creator_id description] :as segment}]
    (map->SegmentInstance
      (assoc segment
        :creator     (delay (when creator_id (db/sel :one User :id creator_id)))
        :description (u/jdbc-clob->str description))))

  (pre-cascade-delete [_ {:keys [id]}]
    (when-not (config/is-test?)
      (throw (Exception. "deleting a Segment is not supported.")))))

(extend-ICanReadWrite SegmentEntity :read :always, :write :superuser)


;; ## Persistence Functions

(defn create-segment
  "Create a new `Segment`.

   Returns the newly created `Segment` or throws an Exception."
  [table-id name description creator-id definition]
  {:pre [(integer? table-id)
         (string? name)
         (integer? creator-id)
         (map? definition)]}
  (-> (db/ins Segment
        :table_id    table-id
        :creator_id  creator-id
        :name        name
        :description description
        :definition  definition)
      (hydrate :creator)))

(defn retrieve-segment
  "Fetch a single `Segment` by its ID value."
  [id]
  {:pre [(integer? id)]}
  (-> (db/sel :one Segment :id id)
      (hydrate :creator)))

(defn retrieve-segments
  "Fetch all `Segments`."
  []
  (-> (db/sel :many Segment (k/order :name :ASC))
      (hydrate :creator)))

(defn update-segment
  "Update an existing `Segment`.

   Returns the updated `Segment` or throws an Exception."
  [{:keys [id name description definition]} change-message]
  {:pre [(integer? id)
         (string? name)
         (map? definition)
         (string? change-message)]}
  (kdb/transaction
    ;; update the segment itself
    (db/upd Segment id
      :name        name
      :description description
      :definition  definition)
    ;; TODO: create a new revision
    ;; fetch the fully updated segment and return it (and fire off an event)
    (->> (retrieve-segment id)
         (events/publish-event :segment-update))))

(defn delete-segment
  "Delete a `Segment`.

   This does a soft delete and simply marks the `Segment` as deleted but does not actually remove the
   record from the database at any time.

   Returns the final state of the `Segment` is successful, or throws an Exception."
  [id]
  {:pre [(integer? id)]}
  (kdb/transaction
    ;; make Segment not active
    (db/upd Segment id
      :active false)
    ;; TODO: create a new revision
    ;; fetch the fully updated segment and return it (and fire off an event)
    (->> (retrieve-segment id)
         (events/publish-event :segment-delete))))

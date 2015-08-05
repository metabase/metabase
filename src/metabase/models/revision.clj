(ns metabase.models.revision
  (:require [korma.core :refer :all, :exclude [defentity update], :as k]
            [medley.core :as m]
            [metabase.db :refer [sel ins upd] :as db]
            [metabase.api.common :refer [*current-user-id* let-404]]
            (metabase.models [card :refer [Card]]
                             [diff :refer [diff-str]]
                             [hydrate :refer [hydrate]]
                             [interface :refer :all]
                             [user :refer [User]])
            [metabase.util :as u]))

(def ^:const max-revisions
  "Maximum number of revisions to keep for each individual object. After this limit is surpassed, the oldest revisions will be deleted."
  15)

;;; # IRevisioned Protocl

(defprotocol IRevisioned
  "Methods an entity may optionally implement to control how revisions of an instance are saved and reverted to."
  (serialize-instance [this id instance]
    "Prepare an instance for serialization in a `Revision`.")
  (revert-to-revision [this id serialized-instance]
    "Return an object to the state recorded by SERIALIZED-INSTANCE.")
  (describe-diff [this username object1 object2]
    "Return a string describing the difference between OBJECT1 and OBJECT2."))

;;; ## Default Impl

(extend-protocol IRevisioned
  Object
  (serialize-instance [_ _ instance]
    (->> (into {} instance)
         (m/filter-vals (complement delay?))))
  (revert-to-revision [entity id serialized-instance]
    (m/mapply upd entity id serialized-instance))
  (describe-diff [entity username o1 o2]
    (diff-str username (:name entity) o1 o2)))


;;; # Revision Entity

(defentity Revision
  [(table :revision)
   (types :object :json)]

  (pre-insert [_ revision]
    (assoc revision :timestamp (u/new-sql-timestamp)))

  (pre-update [_ _]
    (throw (Exception. "You cannot update a Revision!"))))


;;; # Functions

(defn revisions
  "Get the revisions for ENTITY with ID in reverse chronological order."
  [entity id]
  {:pre [(metabase-entity? entity)
         (integer? id)]}
  (sel :many Revision :model (:name entity), :model_id id, (order :id :DESC)))

(defn- revisions-add-diff-strs [entity revisions]
  (loop [acc [], [r1 r2 & more] revisions]
    (if-not r2 (conj acc (assoc r1 :description "First revision."))
            (recur (conj acc (assoc r1 :description (describe-diff entity (:common_name (:user r1)) (:object r2) (:object r1))))
                   (conj more r2)))))

(defn revisions+details [entity id]
  (let [revisions (-> (revisions entity id)
                      (hydrate :user))]
    (->> revisions
         (revisions-add-diff-strs entity)
         (map #(dissoc % :user :model :model_id :user_id :object))
         (filter :description))))

(defn- delete-old-revisions
  "Delete old revisions of ENTITY with ID when there are more than `max-revisions` in the DB."
  [entity id]
  {:pre [(metabase-entity? entity)
         (integer? id)]}
  ;; for some reason (offset max-revisions isn't working)
  (let [old-revisions (drop max-revisions (sel :many :id Revision, :model (:name entity), :model_id id, (order :timestamp :DESC)))]
    (when (seq old-revisions)
      (delete Revision (where {:id [in old-revisions]})))))

;; TODO - it would probably be preferable just to take a typed instance instead of ENTITY with ID + OBJECT
;; Perhaps this function can be made an internal low-level version
(defn push-revision
  "Record a new `Revision` for ENTITY with ID.
   Returns OBJECT."
  [& {object :object, :keys [entity id user-id skip-serialization?], :or {user-id *current-user-id*, id (:id object), skip-serialization? false}}]
  {:pre [(metabase-entity? entity)
         (integer? user-id)
         (db/exists? User :id user-id)
         (integer? id)
         (db/exists? entity :id id)
         (map? object)]}
  (let [object (if skip-serialization? object
                   (serialize-instance entity id object))]
    (assert (map? object))
    (ins Revision :model (:name entity) :model_id id, :user_id user-id, :object object))
  (delete-old-revisions entity id)
  object)


(defn x []
  (push-revision :entity Card, :id 1, :user-id 1, :object {:name "Tips created by day"})
  (push-revision :entity Card, :id 1, :user-id 1, :object {:name "Spots created by day"})
  (revisions Card 1))

(defn z [card-id]
  )

(defn z2 []
  (->> (z)))


;;; # Reverting to a given revision

(defn revert
  "Revert ENTITY with ID to a given `Revision`."
  [& {:keys [entity id user-id revision-id], :or {user-id *current-user-id*}}]
  {:pre [(metabase-entity? entity)
         (integer? id)
         (db/exists? entity :id id)
         (integer? user-id)
         (db/exists? User :id user-id)
         (integer? revision-id)]}
  (let-404 [serialized-instance (sel :one :field [Revision :object] :model (:name entity), :model_id id, :id revision-id)]
    (revert-to-revision entity id serialized-instance)
    ;; Push a new revision to record this reversion
    (push-revision :entity entity, :id id, :object serialized-instance, :user-id user-id, :skip-serialization? true)))


(defn a []
  (revisions+details Card 48))

(defn b [revision-id]
  (revert :entity Card, :id 48, :user-id 1, :revision-id revision-id))

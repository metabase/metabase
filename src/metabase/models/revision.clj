(ns metabase.models.revision
  (:require [korma.core :refer :all, :exclude [defentity update], :as k]
            [medley.core :as m]
            [metabase.db :refer [sel ins upd] :as db]
            [metabase.api.common :refer [let-404]]
            (metabase.models [card :refer [Card]]
                             [diff :refer [diff-str]]
                             [hydrate :refer [hydrate]]
                             [interface :refer :all]
                             [user :refer [User]])
            [metabase.util :as u]))

(defn- model? [model]
  (and (keyword model)
       (contains? models model)))

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
    instance)
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
  "Record a new `Revision` for ENTITY with ID."
  [& {:keys [entity id user-id object]}]
  {:pre [(metabase-entity? entity)
         (integer? user-id)
         (db/exists? User :id user-id)
         (integer? id)
         (db/exists? entity :id id)
         (map? object)]}
  (let [serialized (serialize-instance entity id object)]
    (ins Revision :model (:name entity) :model_id id, :user_id user-id, :object serialized))
  (delete-old-revisions entity id))


(defn x []
  (push-revision :entity Card, :id 1, :user-id 1, :object {:name "Tips created by day"})
  (push-revision :entity Card, :id 1, :user-id 1, :object {:name "Spots created by day"})
  (revisions Card 1))

(defn y []
  (-> (revisions Card 1)
      (hydrate :user)))

(defn- revisions-add-diff-strs [entity revisions]
  (loop [acc [], [r1 r2 & more] revisions]
    (if-not r2 acc
            (recur (conj acc (assoc r1 :description (describe-diff entity (:common_name (:user r1)) (:object r1) (:object r2))))
                   (conj more r2)))))

(defn z []
  (as-> (revisions Card 1) it
    (hydrate it :user)
    (revisions-add-diff-strs Card it)))

(defn z2 []
  (->> (z)
       (map #(dissoc % :user :model :model_id :user_id :object))
       (filter :description)))


;;; # Reverting to a given revision

(defn revert
  "Revert ENTITY with ID to a given `Revision`."
  [entity id revision-id]
  {:pre [entity ; TODO - how to check if this is a valid entity ?
         (integer? id)
         (integer? revision-id)]}
  (let-404 [serialized-instance (sel :one :fields [Revision :object] :model (entity->kw entity), :model_id id, :revision revision-id)]
    (revert-to-revision entity id serialized-instance)))

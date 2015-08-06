(ns metabase.models.revision
  (:require [korma.core :refer :all, :exclude [defentity update], :as k]
            [medley.core :as m]
            [metabase.db :refer [sel ins upd] :as db]
            [metabase.api.common :refer [*current-user-id* let-404]]
            (metabase.models [card :refer [Card]]
                             [hydrate :refer [hydrate]]
                             [interface :refer :all]
                             [user :refer [User]])
            [metabase.models.revision.diff :refer [diff-str]]
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
    (if-not r2
      (conj acc (assoc r1 :description "First revision."))
      (let [username (str (or (:common_name (:user r1))
                              "An unknown user")
                          (when (:is_reversion r1)
                            " reverted to an earlier revision and"))]
        (recur (conj acc (assoc r1 :description (describe-diff entity username (:object r2) (:object r1))))
               (conj more r2))))))

(defn- add-details
  "Hydrate `user` and add `:description` to a sequence of REVISIONS."
  [entity revisions]
  (->> (hydrate revisions :user)
       (revisions-add-diff-strs entity)
       ;; Filter out revisions where nothing changed from the one before it
       (filter :description)
       ;; Filter out irrelevant info
       (map (fn [revision]
              (-> revision
                  (dissoc :model :model_id :user_id :object)
                  (update :user (u/rpartial select-keys [:id :common_name :first_name :last_name])))))))

(defn revisions+details
  "Fetch `revisions` for ENTITY with ID and add details."
  [entity id]
  (add-details entity (revisions entity id)))

(defn- delete-old-revisions
  "Delete old revisions of ENTITY with ID when there are more than `max-revisions` in the DB."
  [entity id]
  {:pre [(metabase-entity? entity)
         (integer? id)]}
  ;; for some reason (offset max-revisions isn't working)
  (let [old-revisions (drop max-revisions (sel :many :id Revision, :model (:name entity), :model_id id, (order :timestamp :DESC)))]
    (when (seq old-revisions)
      (delete Revision (where {:id [in old-revisions]})))))

(defn push-revision
  "Record a new `Revision` for ENTITY with ID.
   Returns OBJECT."
  {:arglists '([& {:keys [object entity id user-id skip-serialization? is-reversion?]}])}
  [& {object :object, :keys [entity id user-id skip-serialization? is-reversion?], :or {user-id *current-user-id*, id (:id object), skip-serialization? false, is-reversion? false}}]
  {:pre [(metabase-entity? entity)
         (integer? user-id)
         (db/exists? User :id user-id)
         (integer? id)
         (db/exists? entity :id id)
         (map? object)]}
  (let [object (if skip-serialization? object
                   (serialize-instance entity id object))]
    (assert (map? object))
    (ins Revision :model (:name entity) :model_id id, :user_id user-id, :object object, :is_reversion is-reversion?))
  (delete-old-revisions entity id)
  object)

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
    (push-revision :entity entity, :id id, :object serialized-instance, :user-id user-id, :skip-serialization? true, :is-reversion? true)))

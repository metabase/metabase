(ns metabase.models.revision
  (:require [clojure.data :as data]
            [korma.core :as k]
            [medley.core :as m]
            [metabase.db :as db]
            [metabase.api.common :refer [*current-user-id* let-404]]
            (metabase.models [hydrate :refer [hydrate]]
                             [interface :as i]
                             [user :refer [User]])
            [metabase.models.revision.diff :refer [diff-string]]
            [metabase.util :as u]
            [korma.db :as kdb]))

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
  (diff-map [this object1 object2]
    "Return a map describing the difference between OBJECT1 and OBJECT2.")
  (diff-str [this object1 object2]
    "Return a string describing the difference between OBJECT1 and OBJECT2."))


;;; # Reusable Base Implementations for IRevisioned functions

;; NOTE that we do not provide a base implementation for `serialize-instance`, that should be done per entity.

(defn default-revert-to-revision
  "Default implementation of `revert-to-revision` which simply does an update using the values from `serialized-instance`."
  [entity id serialized-instance]
  (m/mapply db/upd entity id serialized-instance))

(defn default-diff-map
  "Default implementation of `diff-map` which simply uses clojures `data/diff` function and sets the keys `:before` and `:after`."
  [_ o1 o2]
  (when o1
    (let [[before after] (data/diff o1 o2)]
      {:before before
       :after  after})))

(defn default-diff-str
  "Default implementation of `diff-str` which simply uses clojures `data/diff` function and passes that on to `diff-string`."
  [entity o1 o2]
  (when-let [[before after] (data/diff o1 o2)]
    (diff-string (:name entity) before after)))


;;; # Revision Entity

(defn- post-select [{:keys [message] :as revision}]
  (assoc revision :message (u/jdbc-clob->str message)))

(i/defentity Revision :revision)

(extend (class Revision)
  i/IEntity
  (merge i/IEntityDefaults
         {:types        (constantly {:object :json})
          :post-select  post-select
          :pre-insert   (u/rpartial assoc :timestamp (u/new-sql-timestamp))
          :pre-update   (fn [& _] (throw (Exception. "You cannot update a Revision!")))}))


;;; # Functions

(defn add-revision-details
  "Add enriched revision data such as `:diff` and `:description` as well as filter out some unnecessary props."
  [entity revision prev-revision]
  (-> revision
      (assoc :diff        (diff-map entity (:object prev-revision) (:object revision))
             :description (diff-str entity (:object prev-revision) (:object revision)))
      ;; add revision user details
      (hydrate :user)
      (update :user (fn [u] (select-keys u [:id :first_name :last_name :common_name])))
      ;; Filter out irrelevant info
      (dissoc :model :model_id :user_id :object)))

(defn revisions
  "Get the revisions for ENTITY with ID in reverse chronological order."
  [entity id]
  {:pre [(i/metabase-entity? entity)
         (integer? id)]}
  (db/sel :many Revision :model (:name entity), :model_id id, (k/order :id :DESC)))

(defn revisions+details
  "Fetch `revisions` for ENTITY with ID and add details."
  [entity id]
  (when-let [revisions (revisions entity id)]
    (loop [acc [], [r1 r2 & more] revisions]
      (if-not r2
        (conj acc (add-revision-details entity r1 nil))
        (recur (conj acc (add-revision-details entity r1 r2))
               (conj more r2))))))

(defn- delete-old-revisions
  "Delete old revisions of ENTITY with ID when there are more than `max-revisions` in the DB."
  [entity id]
  {:pre [(i/metabase-entity? entity)
         (integer? id)]}
  ;; for some reason (offset max-revisions isn't working)
  (let [old-revisions (drop max-revisions (db/sel :many :id Revision, :model (:name entity), :model_id id, (k/order :timestamp :DESC)))]
    (when (seq old-revisions)
      (k/delete Revision (k/where {:id [in old-revisions]})))))

(defn push-revision
  "Record a new `Revision` for ENTITY with ID.
   Returns OBJECT."
  {:arglists '([& {:keys [object entity id user-id is-creation? message]}])}
  [& {object :object,
      :keys [entity id user-id is-creation? message],
      :or {id (:id object), is-creation? false}}]
  {:pre [(i/metabase-entity? entity)
         (integer? user-id)
         (db/exists? User :id user-id)
         (integer? id)
         (db/exists? entity :id id)
         (map? object)]}
  (let [object (dissoc object :message)
        object (serialize-instance entity id object)]
    ;; make sure we still have a map after calling out serialization function
    (assert (map? object))
    (db/ins Revision
      :model        (:name entity)
      :model_id     id
      :user_id      user-id
      :object       object
      :is_creation  is-creation?
      :is_reversion false
      :message      message))
  (delete-old-revisions entity id)
  object)

(defn revert
  "Revert ENTITY with ID to a given `Revision`."
  [& {:keys [entity id user-id revision-id]}]
  {:pre [(i/metabase-entity? entity)
         (integer? id)
         (db/exists? entity :id id)
         (integer? user-id)
         (db/exists? User :id user-id)
         (integer? revision-id)]}
  (let [serialized-instance (db/sel :one :field [Revision :object] :model (:name entity), :model_id id, :id revision-id)]
    (kdb/transaction
      ;; Do the reversion of the object
      (revert-to-revision entity id serialized-instance)
      ;; Push a new revision to record this change
      (let [last-revision (db/sel :one Revision :model (:name entity), :model_id id (k/order :id :DESC))
            new-revision  (db/ins Revision
                            :model        (:name entity)
                            :model_id     id
                            :user_id      user-id
                            :object       serialized-instance
                            :is_creation  false
                            :is_reversion true)]
        (add-revision-details entity new-revision last-revision)))))


(u/require-dox-in-this-namespace)

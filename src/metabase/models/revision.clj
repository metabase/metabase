(ns metabase.models.revision
  (:require [clojure.data :as data]
            [metabase.models.revision.diff :refer [diff-string]]
            [metabase.models.user :refer [User]]
            [metabase.util :as u]
            [puppetlabs.i18n.core :refer [tru]]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]
             [models :as models]]))

(def ^:const max-revisions
  "Maximum number of revisions to keep for each individual object. After this limit is surpassed, the oldest revisions will be deleted."
  15)

;;; # IRevisioned Protocl

(defprotocol IRevisioned
  "Methods an entity may optionally implement to control how revisions of an instance are saved and reverted to.
   All of these methods except for `serialize-instance` have a default implementation in `IRevisionedDefaults`."
  (serialize-instance [this id instance]
    "Prepare an instance for serialization in a `Revision`.")
  (revert-to-revision! [this id user-id serialized-instance]
    "Return an object to the state recorded by SERIALIZED-INSTANCE.")
  (diff-map [this object1 object2]
    "Return a map describing the difference between OBJECT1 and OBJECT2.")
  (diff-str [this object1 object2]
    "Return a string describing the difference between OBJECT1 and OBJECT2."))


;;; # Reusable Base Implementations for IRevisioned functions

;; NOTE that we do not provide a base implementation for `serialize-instance`, that should be done per entity.

(defn default-revert-to-revision!
  "Default implementation of `revert-to-revision!` which simply does an update using the values from `serialized-instance`."
  [entity id user-id serialized-instance]
  (db/update! entity id, serialized-instance))

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

(def IRevisionedDefaults
  "Default implementations for `IRevisioned`."
  {:revert-to-revision! default-revert-to-revision!
   :diff-map            default-diff-map
   :diff-str            default-diff-str})


;;; # Revision Entity

(models/defmodel Revision :revision)

(defn- pre-insert [revision]
  (assoc revision :timestamp (u/new-sql-timestamp)))

(u/strict-extend (class Revision)
  models/IModel
  (merge models/IModelDefaults
         {:types      (constantly {:object :json, :message :clob})
          :pre-insert pre-insert
          :pre-update (fn [& _] (throw (Exception. (str (tru "You cannot update a Revision!")))))}))


;;; # Functions

(defn add-revision-details
  "Add enriched revision data such as `:diff` and `:description` as well as filter out some unnecessary props."
  [entity revision prev-revision]
  (-> revision
      (assoc :diff        (diff-map entity (:object prev-revision) (:object revision))
             :description (diff-str entity (:object prev-revision) (:object revision)))
      ;; add revision user details
      (hydrate :user)
      (update :user (u/rpartial select-keys [:id :first_name :last_name :common_name]))
      ;; Filter out irrelevant info
      (dissoc :model :model_id :user_id :object)))

(defn revisions
  "Get the revisions for ENTITY with ID in reverse chronological order."
  [entity id]
  {:pre [(models/model? entity)
         (integer? id)]}
  (db/select Revision, :model (:name entity), :model_id id, {:order-by [[:id :desc]]}))

(defn revisions+details
  "Fetch `revisions` for ENTITY with ID and add details."
  [entity id]
  (when-let [revisions (revisions entity id)]
    (loop [acc [], [r1 r2 & more] revisions]
      (if-not r2
        (conj acc (add-revision-details entity r1 nil))
        (recur (conj acc (add-revision-details entity r1 r2))
               (conj more r2))))))

(defn- delete-old-revisions!
  "Delete old revisions of ENTITY with ID when there are more than `max-revisions` in the DB."
  [entity id]
  {:pre [(models/model? entity) (integer? id)]}
  (when-let [old-revisions (seq (drop max-revisions (map :id (db/select [Revision :id], :model (:name entity), :model_id id, {:order-by [[:timestamp :desc]]}))))]
    (db/delete! Revision :id [:in old-revisions])))

(defn push-revision!
  "Record a new `Revision` for ENTITY with ID.
   Returns OBJECT."
  {:arglists '([& {:keys [object entity id user-id is-creation? message]}]), :style/indent 0}
  [& {object :object,
      :keys [entity id user-id is-creation? message],
      :or {id (:id object), is-creation? false}}]
  {:pre [(models/model? entity)
         (integer? user-id)
         (db/exists? User :id user-id)
         (integer? id)
         (db/exists? entity :id id)
         (map? object)]}
  (let [object (serialize-instance entity id (dissoc object :message))]
    ;; make sure we still have a map after calling out serialization function
    (assert (map? object))
    (db/insert! Revision
      :model        (:name entity)
      :model_id     id
      :user_id      user-id
      :object       object
      :is_creation  is-creation?
      :is_reversion false
      :message      message))
  (delete-old-revisions! entity id)
  object)

(defn revert!
  "Revert ENTITY with ID to a given `Revision`."
  {:style/indent 0}
  [& {:keys [entity id user-id revision-id]}]
  {:pre [(models/model? entity)
         (integer? id)
         (db/exists? entity :id id)
         (integer? user-id)
         (db/exists? User :id user-id)
         (integer? revision-id)]}
  (let [serialized-instance (db/select-one-field :object Revision, :model (:name entity), :model_id id, :id revision-id)]
    (db/transaction
      ;; Do the reversion of the object
      (revert-to-revision! entity id user-id serialized-instance)
      ;; Push a new revision to record this change
      (let [last-revision (Revision :model (:name entity), :model_id id, {:order-by [[:id :desc]]})
            new-revision  (db/insert! Revision
                            :model        (:name entity)
                            :model_id     id
                            :user_id      user-id
                            :object       serialized-instance
                            :is_creation  false
                            :is_reversion true)]
        (add-revision-details entity new-revision last-revision)))))

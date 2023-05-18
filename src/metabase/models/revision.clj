(ns metabase.models.revision
  (:require
   [clojure.data :as data]
   [metabase.db.util :as mdb.u]
   [metabase.models.interface :as mi]
   [metabase.models.revision.diff :refer [build-sentence diff-strings]]
   [metabase.models.user :refer [User]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [toucan.hydrate :refer [hydrate]]
   [toucan.models :as models]
   [toucan2.core :as t2]
   [toucan2.model :as t2.model]))

(def ^:const max-revisions
  "Maximum number of revisions to keep for each individual object. After this limit is surpassed, the oldest revisions
  will be deleted."
  15)

(defmulti serialize-instance
  "Prepare an instance for serialization in a Revision."
  {:arglists '([model id instance])}
  mi/dispatch-on-model)

;;; no default implementation for [[serialize-instance]]; models need to implement this themselves.

(defmulti revert-to-revision!
  "Return an object to the state recorded by `serialized-instance`."
  {:arglists '([model id user-id serialized-instance])}
  mi/dispatch-on-model)

(defmethod revert-to-revision! :default
  [model id _user-id serialized-instance]
  (t2/update! model id, serialized-instance))

(defmulti diff-map
  "Return a map describing the difference between `object-1` and `object-2`."
  {:arglists '([model object-1 object-2])}
  mi/dispatch-on-model)

(defmethod diff-map :default
  [_model o1 o2]
  (when o1
    (let [[before after] (data/diff o1 o2)]
      {:before before
       :after  after})))

(defmulti diff-strs
  "Return a seq of string describing the difference between `object-1` and `object-2`.

  Each string in the seq should be i18n-ed."
  {:arglists '([model object-1 object-2])}
  mi/dispatch-on-model)

(defmethod diff-strs :default
  [model o1 o2]
  (when-let [[before after] (data/diff o1 o2)]
    (diff-strings (name model) before after)))

;;; # Revision Entity

(models/defmodel Revision :revision)

(defn- pre-insert [revision]
  (assoc revision :timestamp :%now))

(defn- do-post-select-for-object
  "Call the appropriate `post-select` methods (including the type functions) on the `:object` this Revision recorded.
  This is important for things like Card revisions, where the `:dataset_query` property needs to be normalized when
  coming out of the DB."
  [{:keys [model], :as revision}]
  ;; in some cases (such as tests) we have 'fake' models that cannot be resolved normally; don't fail entirely in
  ;; those cases
  (let [model (u/ignore-exceptions (t2.model/resolve-model (symbol model)))]
    (cond-> revision
      model (update :object (partial models/do-post-select model)))))

(mi/define-methods
 Revision
 {:types       (constantly {:object :json})
  :pre-insert  pre-insert
  :pre-update  (fn [& _] (throw (Exception. (tru "You cannot update a Revision!"))))
  :post-select do-post-select-for-object})


;;; # Functions

(defn- revision-changes
  [model prev-revision revision]
  (cond
    (:is_creation revision)  [(deferred-tru "created this")]
    (:is_reversion revision) [(deferred-tru "reverted to an earlier version")]
    :else                    (diff-strs model (:object prev-revision) (:object revision))))

(defn- revision-title+description
  [model prev-revision {:keys [is_creation is_reversion] :as revision}]
  (let [changes (revision-changes model prev-revision revision)]
    {:description          (build-sentence changes)
     ;; If > 1 item's fields are changed in a single revision,
     ;; the changes are batched into a single string like:
     ;; "added a description, moved cards around and archived this"
     ;; Batched messages can be long, so if the revision's diff contains > 1 field,
     ;; we want to show the changelog in a description and set a title to just "User edited this"
     ;; If only one field is changed, we just show everything in the title
     ;; like "John added a description"
     :title                (if (and (every? false? [is_creation is_reversion])
                                    (> (count changes) 1))
                             (deferred-tru "edited this.")
                             (build-sentence changes))
     ;; this is used on FE
     :has_multiple_changes (> (count changes) 1)}))

(defn add-revision-details
  "Add enriched revision data such as `:diff` and `:description` as well as filter out some unnecessary props."
  [model revision prev-revision]
  (-> revision
      (assoc :diff (diff-map model (:object prev-revision) (:object revision)))
      (merge (revision-title+description model prev-revision revision))
      ;; add revision user details
      (hydrate :user)
      (update :user select-keys [:id :first_name :last_name :common_name])
      ;; Filter out irrelevant info
      (dissoc :model :model_id :user_id :object)))

(defn revisions
  "Get the revisions for `model` with `id` in reverse chronological order."
  [model id]
  {:pre [(mdb.u/toucan-model? model) (integer? id)]}
  (t2/select Revision, :model (name model), :model_id id, {:order-by [[:id :desc]]}))

(defn revisions+details
  "Fetch `revisions` for `model` with `id` and add details."
  [model id]
  (when-let [revisions (revisions model id)]
    (loop [acc [], [r1 r2 & more] revisions]
      (if-not r2
        (conj acc (add-revision-details model r1 nil))
        (recur (conj acc (add-revision-details model r1 r2))
               (conj more r2))))))

(defn- delete-old-revisions!
  "Delete old revisions of `model` with `id` when there are more than `max-revisions` in the DB."
  [model id]
  {:pre [(mdb.u/toucan-model? model) (integer? id)]}
  (when-let [old-revisions (seq (drop max-revisions (map :id (t2/select [Revision :id]
                                                               :model    (name model)
                                                               :model_id id
                                                               {:order-by [[:timestamp :desc]]}))))]
    (t2/delete! Revision :id [:in old-revisions])))

(defn push-revision!
  "Record a new Revision for `entity` with `id` if it's changed compared to the last revision.
  Returns `object` or `nil` if the object does not changed."
  {:arglists '([& {:keys [object entity id user-id is-creation? message]}])}
  [& {object :object,
      :keys [entity id user-id is-creation? message],
      :or {id (:id object), is-creation? false}}]
  ;; TODO - rewrite this to use a schema
  {:pre [(mdb.u/toucan-model? entity)
         (integer? user-id)
         (t2/exists? User :id user-id)
         (integer? id)
         (t2/exists? entity :id id)
         (map? object)]}
  (let [serialized-object (serialize-instance entity id (dissoc object :message))
        last-object       (t2/select-one-fn :object Revision :model (name entity) :model_id id {:order-by [[:id :desc]]})]
    ;; make sure we still have a map after calling out serialization function
    (assert (map? serialized-object))
    (when-not (= serialized-object last-object)
      (t2/insert! Revision
                  :model        (name entity)
                  :model_id     id
                  :user_id      user-id
                  :object       serialized-object
                  :is_creation  is-creation?
                  :is_reversion false
                  :message      message)
      (delete-old-revisions! entity id)
      object)))

(defn revert!
  "Revert `entity` with `id` to a given Revision."
  [& {:keys [entity id user-id revision-id]}]
  {:pre [(mdb.u/toucan-model? entity)
         (integer? id)
         (t2/exists? entity :id id)
         (integer? user-id)
         (t2/exists? User :id user-id)
         (integer? revision-id)]}
  (let [serialized-instance (t2/select-one-fn :object Revision, :model (name entity), :model_id id, :id revision-id)]
    (t2/with-transaction [_conn]
      ;; Do the reversion of the object
      (revert-to-revision! entity id user-id serialized-instance)
      ;; Push a new revision to record this change
      (let [last-revision (t2/select-one Revision :model (name entity), :model_id id, {:order-by [[:id :desc]]})
            new-revision  (first (t2/insert-returning-instances! Revision
                                                                 :model        (name entity)
                                                                 :model_id     id
                                                                 :user_id      user-id
                                                                 :object       serialized-instance
                                                                 :is_creation  false
                                                                 :is_reversion true))]
        (add-revision-details entity new-revision last-revision)))))

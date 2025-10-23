(ns metabase.revisions.models.revision
  (:require
   [clojure.data :as data]
   [metabase.config.core :as config]
   [metabase.models.interface :as mi]
   [metabase.queries.core :as queries]
   [metabase.revisions.models.revision.diff :refer [diff-strings*]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.model :as t2.model]))

(defn toucan-model?
  "Check if `model` is a toucan model."
  [model]
  (isa? model :metabase/model))

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
  (let [valid-columns   (keys (t2/select-one (t2/table-name model) :id id))
        ;; Only include fields that we know are on the model in the current version of Metabase! Otherwise we'll get
        ;; an error if a field in an earlier version has since been dropped, but is still present in the revision.
        ;; This is best effort — other kinds of schema changes could still break the ability to revert successfully.
        revert-instance (select-keys serialized-instance valid-columns)]
    (t2/update! model id revert-instance)))

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

(defmulti diff-strings
  "Return a seq of string describing the difference between `object-1` and `object-2`.

  Each string in the seq should be i18n-ed."
  {:arglists '([model object-1 object-2])}
  mi/dispatch-on-model)

(defmethod diff-strings :default
  [model o1 o2]
  (diff-strings* (name model) o1 o2))

;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(methodical/defmethod t2/table-name :model/Revision [_model] :revision)

(doto :model/Revision
  (derive :metabase/model)
  (derive :hook/search-index))

(t2/deftransforms :model/Revision
  {:object mi/transform-json})

(t2/define-before-insert :model/Revision
  [revision]
  ;; Require ::internal-use-only key to prevent direct t2/insert! calls.
  ;; Use insert-revision! or insert-revisions! instead, which handle locking and cleanup efficiently.
  (when-not (::internal-use-only revision)
    (throw (ex-info (str "Direct insertion of revisions is not allowed. "
                         "Use metabase.revisions.models.revision/insert-revision! or "
                         "metabase.revisions.models.revision/insert-revisions! instead.")
                    {:revision revision})))
  ;; Remove the internal key - all other fields are already set by insert-revisions!
  (dissoc revision ::internal-use-only))

(t2/define-before-update :model/Revision
  [_revision]
  (fn [& _] (throw (Exception. (tru "You cannot update a Revision!")))))

(t2/define-after-select :model/Revision
  ;; Call the appropriate `post-select` methods (including the type functions) on the `:object` this Revision recorded.
  ;; This is important for things like Card revisions, where the `:dataset_query` property needs to be normalized when
  ;; coming out of the DB.
  [{:keys [model] :as revision}]
  ;; in some cases (such as tests) we have 'fake' models that cannot be resolved normally; don't fail entirely in
  ;; those cases
  (let [model (u/ignore-exceptions (t2.model/resolve-model (symbol model)))]
    (cond-> revision
      ;; For Card revisions, ensure :card_schema is present before calling after-select.
      ;; Old revisions from before v0.55 won't have this field!
      ;; We add the legacy default value to handle these cases.
      (and (= model :model/Card) (map? (:object revision)) (not (:card_schema (:object revision))))
      (update :object assoc :card_schema queries/starting-card-schema-version)

      model (update :object (partial mi/do-after-select model)))))

;;; # Functions

(defn- revision-changes
  [model prev-revision revision]
  (cond
    (:is_creation revision)  [(deferred-tru "created this")]
    (:is_reversion revision) [(deferred-tru "reverted to an earlier version")]
    ;; We only keep [[revision/max-revisions]] number of revision per entity.
    ;; prev-revision can be nil when we generate description for oldest revision
    (nil? prev-revision)     [(deferred-tru "modified this")]
    :else                    (diff-strings model (:object prev-revision) (:object revision))))

(defn- revision-description-info
  [model prev-revision revision]
  (let [changes (revision-changes model prev-revision revision)]
    {:description          (if (seq changes)
                             (u/build-sentence changes)
                             ;; HACK: before #30285 we record revision even when there is nothing changed,
                             ;; so there are cases when revision can comeback as `nil`.
                             ;; This is a safe guard for us to not display "Crowberto null" as
                             ;; description on UI
                             (deferred-tru "created a revision with no change."))
     ;; this is used on FE
     :has_multiple_changes (> (count changes) 1)}))

(defn add-revision-details
  "Add enriched revision data such as `:diff` and `:description` as well as filter out some unnecessary props."
  [model revision prev-revision]
  (-> revision
      (assoc :diff (diff-map model (:object prev-revision) (:object revision)))
      (merge (revision-description-info model prev-revision revision))
      ;; add revision user details
      (t2/hydrate :user)
      (update :user select-keys [:id :first_name :last_name :common_name])
      ;; Filter out irrelevant info
      (dissoc :model :model_id :user_id :object)))

(mu/defn revisions
  "Get the revisions for `model` with `id` in reverse chronological order."
  [model :- [:fn toucan-model?]
   id    :- pos-int?]
  (let [model-name (name model)]
    (t2/select :model/Revision :model model-name :model_id id {:order-by [[:id :desc]]})))

(mu/defn revisions+details
  "Fetch `revisions` for `model` with `id` and add details."
  [model :- [:fn toucan-model?]
   id    :- pos-int?]
  (when-let [revisions (revisions model id)]
    (loop [acc [], [r1 r2 & more] revisions]
      (if-not r2
        (conj acc (add-revision-details model r1 nil))
        (recur (conj acc (add-revision-details model r1 r2))
               (conj more r2))))))

(defn insert-revisions!
  "Efficiently insert multiple revisions with proper locking and cleanup.

  This function performs all necessary queries in constant time O(1):
  - Single query to acquire locks on existing revisions for all model/model_id pairs
  - Single batch insert for all revisions
  - Single UPDATE to set most_recent = false for previous revisions
  - Single SELECT + DELETE to clean up old revisions

  Takes a collection of revision row maps with keys:
  - :model (string)
  - :model_id (int)
  - :user_id (int)
  - :object (serialized map)
  - :is_creation (boolean)
  - :is_reversion (boolean)
  - :message (optional string)

  Returns the collection of inserted revision instances."
  [revision-rows]
  (when (seq revision-rows)
    (t2/with-transaction [_conn]
      (let [model-ids (distinct (map (juxt :model :model_id) revision-rows))
            ;; Build WHERE clause once: (model = 'Card' AND model_id = 1) OR (model = 'Dashboard' AND model_id = 2) OR ...
            or-conditions (when (seq model-ids)
                            (into [:or]
                                  (map (fn [[model model-id]]
                                         [:and
                                          [:= :model model]
                                          [:= :model_id model-id]])
                                       model-ids)))]
        ;; Step 1: Acquire locks on ALL relevant revisions in a SINGLE query
        (when or-conditions
          (t2/query {:select [:id]
                     :from [:revision]
                     :where or-conditions
                     :for :update}))

        ;; Step 2: Prepare and insert all revisions with metadata
        (let [prepared-rows (map #(assoc %
                                         :timestamp :%now
                                         :metabase_version config/mb-version-string
                                         :most_recent true
                                         ::internal-use-only true)
                                 revision-rows)
              inserted-revisions (t2/insert-returning-instances! :model/Revision prepared-rows)
              new-revision-ids (set (map :id inserted-revisions))]

          ;; Step 3: Update ALL previous revisions to most_recent = false in a SINGLE query
          (when (and or-conditions (seq new-revision-ids))
            (t2/query {:update (t2/table-name :model/Revision)
                       :where [:and
                               or-conditions
                               [:= :most_recent true]
                               [:not-in :id new-revision-ids]]
                       :set {:most_recent false}}))

          ;; Step 4: Clean up old revisions in a SINGLE SELECT + SINGLE DELETE
          (when or-conditions
            (let [all-revisions (t2/select :model/Revision
                                           {:where or-conditions
                                            :order-by [[:timestamp :desc] [:id :desc]]})
                  revisions-by-entity (group-by (juxt :model :model_id) all-revisions)
                  old-revision-ids (into []
                                         (mapcat (fn [[_entity-key revisions]]
                                                   (map :id (drop max-revisions revisions))))
                                         revisions-by-entity)]
              (when (seq old-revision-ids)
                (t2/delete! :model/Revision :id [:in old-revision-ids]))))
          inserted-revisions)))))

(defn insert-revision!
  "Efficiently insert a single revision.

  See [[insert-revisions!]] for details. This is a convenience wrapper for inserting
  a single revision."
  [revision-row]
  (first (insert-revisions! [revision-row])))

(mu/defn push-revisions!
  "Record multiple new Revisions with a single batch insert.

  Takes a collection of revision data maps, each with the same structure as `push-revision!`:
  - `:id`: the ID of the object being revised
  - `:entity`: the model keyword (e.g. `:model/Card`)
  - `:user-id`: the user ID creating the revision
  - `:object`: the current state of the object
  - `:previous-object`: the previous state (nil for creation)
  - `:is-creation?`: whether this is a creation (optional, default false)
  - `:message`: optional revision message

  Returns a collection of objects that were actually revised (objects that didn't change are filtered out)."
  [revisions :- [:sequential [:map {:closed true}
                              [:id                            pos-int?]
                              [:object                        :map]
                              [:previous-object               [:maybe :map]]
                              [:entity                        [:fn toucan-model?]]
                              [:user-id                       pos-int?]
                              [:is-creation? {:optional true} [:maybe :boolean]]
                              [:message      {:optional true} [:maybe :string]]]]]
  (when (seq revisions)
    (let [revision-rows
          (for [{:keys [id entity user-id object previous-object is-creation? message]
                 :or {is-creation? false}} revisions
                :let [entity-name (name entity)
                      serialized-object (serialize-instance entity id (dissoc object :message))
                      previous-object-for-comparison (cond-> previous-object
                                                       (= entity :model/Card) (dissoc :card_schema))]
                :when (and (map? serialized-object)
                           (or (nil? previous-object)
                               (not= (json/encode serialized-object)
                                     (json/encode previous-object-for-comparison))))]
            {:model        entity-name
             :model_id     id
             :user_id      user-id
             :object       serialized-object
             :is_creation  is-creation?
             :is_reversion false
             :message      message
             :_object      object})]
      (when (seq revision-rows)
        (insert-revisions! (map #(dissoc % :_object) revision-rows))
        (map :_object revision-rows)))))

(mu/defn push-revision!
  "Record a new Revision for `entity` with `id` if it's changed compared to the previous object.
  Returns `object` or `nil` if the object does not changed.

  `previous-object` should be the object before the change, or `nil` if this is a creation."
  [{:keys [id entity user-id object previous-object
           is-creation? message]
    :or   {is-creation? false}}     :- [:map {:closed true}
                                        [:id                            pos-int?]
                                        [:object                        :map]
                                        [:previous-object               [:maybe :map]]
                                        [:entity                        [:fn toucan-model?]]
                                        [:user-id                       pos-int?]
                                        [:is-creation? {:optional true} [:maybe :boolean]]
                                        [:message      {:optional true} [:maybe :string]]]]
  (push-revisions! [{:id              id
                     :entity          entity
                     :user-id         user-id
                     :object          object
                     :previous-object previous-object
                     :is-creation?    is-creation?
                     :message         message}]))

(mu/defn revert!
  "Revert `entity` with `id` to a given Revision."
  [info :- [:map {:closed true}
            [:id          pos-int?]
            [:user-id     pos-int?]
            [:revision-id pos-int?]
            [:entity      [:fn toucan-model?]]]]
  (let [{:keys [id user-id revision-id entity]} info
        model-name (name entity)
        serialized-instance (t2/select-one-fn :object :model/Revision :model model-name :model_id id :id revision-id)]
    (t2/with-transaction [_conn]
      ;; Do the reversion of the object
      (revert-to-revision! entity id user-id serialized-instance)
      ;; Push a new revision to record this change
      (let [last-revision (t2/select-one :model/Revision :model model-name, :model_id id, {:order-by [[:id :desc]]})
            new-revision  (insert-revision! {:model        model-name
                                             :model_id     id
                                             :user_id      user-id
                                             :object       serialized-instance
                                             :is_creation  false
                                             :is_reversion true})]
        (add-revision-details entity new-revision last-revision)))))

(ns metabase.revisions.models.revision
  (:require
   [clojure.data :as data]
   [malli.core :as mc]
   [metabase.config.core :as config]
   [metabase.explorations.schema]
   [metabase.measures.schema]
   [metabase.models.interface :as mi]
   [metabase.queries.core :as queries]
   [metabase.revisions.db :as revisions.db]
   [metabase.revisions.models.revision.diff :refer [diff-strings*]]
   [metabase.segments.schema]
   [metabase.transforms.schema]
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
  (let [valid-columns   (keys (revisions.db/raw-row model id))
        ;; Only include fields that we know are on the model in the current version of Metabase! Otherwise we'll get
        ;; an error if a field in an earlier version has since been dropped, but is still present in the revision.
        ;; This is best effort — other kinds of schema changes could still break the ability to revert successfully.
        revert-instance (select-keys serialized-instance valid-columns)]
    (revisions.db/update-entity! id {:model model :row revert-instance})))

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

(defmulti revision-readable?
  "Whether the current user may see the revision whose serialized snapshot is `object`. Defaults to true: a caller
  who can read an object's current row can read its whole revision history. Models whose snapshots carry
  data-permission-sensitive definitions override this to authorize each snapshot on its own terms."
  {:arglists '([model object])}
  mi/dispatch-on-model)

(defmethod revision-readable? :default
  [_model _object]
  true)

;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(methodical/defmethod t2/table-name :model/Revision [_model] :revision)

(doto :model/Revision
  (derive :metabase/model)
  (derive :hook/search-index))

(t2/deftransforms :model/Revision
  {:object mi/transform-json})

(t2/define-before-insert :model/Revision
  [{:keys [model model_id] :as revision}]
  ;; obtain a lock on the existing revisions for this entity to prevent concurrent inserts of new revisions
  (revisions.db/lock-revisions! model model_id)
  (assoc revision
         :timestamp (or (:timestamp revision) :%now)
         :metabase_version config/mb-version-string
         :most_recent true))

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

(defn- delete-old-revisions!
  "Delete old revisions of `model` with `id` when there are more than `max-revisions` in the DB."
  [model id]
  (when-let [old-revisions (seq (drop max-revisions (revisions.db/revision-ids-newest-first (name model) id)))]
    (revisions.db/delete-revisions! old-revisions)))

(t2/define-after-insert :model/Revision
  [revision]
  (u/prog1 revision
    (let [{:keys [id model model_id]} revision]
      ;; Update the last `most_recent revision` to false (not including the current revision). Select the ids, then
      ;; update by id: an UPDATE with the filter of the select can scan and lock the rows of other entities (MariaDB uses
      ;; an index merge with `idx_revision_most_recent`), and then deadlock with a revision write of another entity.
      (when-let [ids (not-empty (revisions.db/most-recent-revision-ids model model_id id))]
        (revisions.db/unmark-most-recent-revisions! ids))
      (delete-old-revisions! model model_id))))

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
    (revisions.db/revisions model-name id)))

(mu/defn revisions+details
  "Fetch `revisions` for `model` with `id` that the current user may see, and add details. Diffs and descriptions
  are computed between consecutive *visible* revisions, so a snapshot the caller is not entitled to never leaks
  through an adjacent revision's diff."
  [model :- [:fn toucan-model?]
   id    :- pos-int?]
  (when-let [revisions (revisions model id)]
    (loop [acc [], [r1 r2 & more] (filterv #(revision-readable? model (:object %)) revisions)]
      (if-not r2
        (conj acc (add-revision-details model r1 nil))
        (recur (conj acc (add-revision-details model r1 r2))
               (conj more r2))))))

(def ^:private PushRevisionInput
  (into [:multi {:dispatch :entity}]
        (conj (vec (for [[model schema] revisions.db/revisioned-model-select-schema]
                     [model [:map {:closed true}
                             [:id                            pos-int?]
                             [:object                        schema]
                             [:entity                        [:= model]]
                             [:user-id                       pos-int?]
                             [:is-creation? {:optional true} [:maybe :boolean]]
                             [:message      {:optional true} [:maybe :string]]]]))
              [::mc/default [:map {:closed true}
                             [:id                            pos-int?]
                             [:object                        ::revisions.db/unregistered-model-object]
                             [:entity                        [:fn toucan-model?]]
                             [:user-id                       pos-int?]
                             [:is-creation? {:optional true} [:maybe :boolean]]
                             [:message      {:optional true} [:maybe :string]]]])))

(defmulti comparable-object
  "`object`, a stored or serialized revision object of `model`, without the keys that must not make two versions
  differ. Nil for nil."
  {:arglists '([model object])}
  mi/dispatch-on-model)

(defmethod comparable-object :default
  [_model object]
  object)

(defmethod comparable-object :model/Card
  [_model object]
  ;; `:card_schema` is an internal marker: `serialize-instance` keeps it, and after-select adds it to revisions stored
  ;; without it
  (dissoc object :card_schema))

(mu/defn push-revision!
  "Record a new Revision for `entity` with `id` if it's changed compared to the last revision.
  Returns `object` or `nil` if the object does not changed."
  [{:keys [id entity user-id object
           is-creation? message]
    :or   {is-creation? false}}     :- PushRevisionInput]
  (let [entity-name (name entity)
        serialized-object (serialize-instance entity id (dissoc object :message))
        last-object (revisions.db/latest-revision-object entity-name id)]
    ;; make sure we still have a map after calling out serialization function
    (assert (map? serialized-object))
    ;; the last-object could have nested object, e.g: Dashboard can have multiple Card in it,
    ;; even though we call `post-select` on the `object`, the nested object might not be transformed correctly
    ;; E.g: Cards inside Dashboard will not be transformed
    ;; so to be safe, we'll just compare them as string
    ;; `comparable-object` applies to both sides: `serialize-instance` can keep a key that it drops. The stored
    ;; object keeps every key, because `revert-to-revision!` reads them back.
    (when-not (= (json/encode (comparable-object entity serialized-object))
                 (json/encode (comparable-object entity last-object)))
      (revisions.db/insert-revision! {:model        entity-name
                                      :model_id     id
                                      :user_id      user-id
                                      :object       serialized-object
                                      :is_creation  is-creation?
                                      :is_reversion false
                                      :message      message})
      object)))

(def ^:private hook-records-revision?
  "Models whose after-update hook publishes the update event inside the writer's transaction, so the revisions listener
  records a Revision while the writer holds the row."
  #{:model/Document :model/TransformTest})

(defn- shared-keys-equal?
  "Whether the revision objects `a` and `b` of `model` hold equal comparable values for each key that both hold."
  [model a b]
  (let [a (comparable-object model a)
        b (comparable-object model b)]
    (= (select-keys a (keys b)) (select-keys b (keys a)))))

(mu/defn revert!
  "Revert `entity` with `id` to the Revision with `revision-id`. When the target differs from the latest Revision, or
  the row of a Document or a TransformTest differs from the target, records one Revision, the reversion, as the
  newest, and returns it with its details; otherwise returns the latest Revision without details. Throws a 404 error
  when the row of a Document or a TransformTest does not exist."
  [info :- [:map {:closed true}
            [:id          pos-int?]
            [:user-id     pos-int?]
            [:revision-id pos-int?]
            [:entity      [:fn toucan-model?]]]]
  (let [{:keys [id user-id revision-id entity]} info
        model-name (name entity)
        serialized-instance (revisions.db/revision-object model-name id revision-id)
        hook-revision? (hook-records-revision? entity)
        ;; the reversion replaces the Revision that the hook records, so it stores the same form
        reversion-object (cond->> serialized-instance
                           hook-revision? (serialize-instance entity id))]
    (t2/with-transaction [_conn]
      (when hook-revision?
        ;; The lock order of an edit: the row, then its Revisions. Until the commit, no other transaction can add a
        ;; Revision of this entity, so each Revision newer than `last-revision` comes from this revert.
        (when (empty? (revisions.db/lock-entity! entity id))
          ;; a delete committed while this revert waited for the row
          (throw (ex-info (tru "Not found.") {:status-code 404})))
        (revisions.db/lock-revisions! model-name id))
      (let [last-revision            (revisions.db/latest-revision model-name id)
            already-in-target-state? (and (= (comparable-object entity serialized-instance)
                                             (comparable-object entity (:object last-revision)))
                                          ;; a write that records no Revision (an import) can leave the row of a hook
                                          ;; model unlike its latest Revision
                                          (or (not hook-revision?)
                                              (shared-keys-equal? entity
                                                                  reversion-object
                                                                  (serialize-instance entity id
                                                                                      (revisions.db/entity entity id)))))]
        (revert-to-revision! entity id user-id serialized-instance)
        (if already-in-target-state?
          (revisions.db/latest-revision model-name id)
          (do
            (when hook-revision?
              ;; the revisions listener may have recorded a plain Revision for the hook's update event; the reversion
              ;; replaces it
              (when-let [extra-ids (not-empty (revisions.db/revision-ids-after model-name id (:id last-revision)))]
                (revisions.db/delete-revisions! extra-ids)))
            (add-revision-details entity
                                  (revisions.db/insert-revision-returning! {:model        model-name
                                                                            :model_id     id
                                                                            :user_id      user-id
                                                                            :object       reversion-object
                                                                            :is_creation  false
                                                                            :is_reversion true})
                                  last-revision)))))))

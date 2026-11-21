(ns metabase.revisions.models.revision
  (:require
   [clojure.data :as data]
   [clojure.walk :as walk]
   [malli.core :as mc]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as mdb]
   [metabase.batch-processing.core :as grouper]
   [metabase.config.core :as config]
   [metabase.events.core :as events]
   [metabase.explorations.schema]
   [metabase.lib.schema.util :as lib.schema.util]
   [metabase.measures.schema]
   [metabase.models.interface :as mi]
   [metabase.revisions.db :as revisions.db]
   [metabase.revisions.models.revision.diff :as revision.diff :refer [diff-strings*]]
   [metabase.revisions.schema :as revisions.schema]
   [metabase.revisions.spec :as revisions.spec]
   [metabase.segments.schema]
   [metabase.transforms.schema]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.model :as t2.model]))

(set! *warn-on-reflection* true)

(defn comparable-definition
  "`definition`, a query, without the uuids and the markers of added base types that its writers and its readers set
  differently."
  [definition]
  (walk/postwalk #(cond-> % (map? %) (dissoc :lib/transformation-added-base-type))
                 (lib.schema.util/remove-lib-uuids definition)))

(defn same-definition?
  "Whether the `:definition` of the row `before` is that of the row `after`, apart from what the writers and the readers
  of a definition set differently."
  [before after]
  (= (comparable-definition (:definition before)) (comparable-definition (:definition after))))

(defn toucan-model?
  "Check if `model` is a toucan model."
  [model]
  (isa? model :metabase/model))

(def ^:const max-revisions
  "Maximum number of revisions to keep for each individual object. After this limit is surpassed, the oldest revisions
  will be deleted."
  15)

(declare snapshots)

(defn- child-rows
  "The child rows under `hydration-key` of each of `rows`, in order, those that the rows do not carry hydrated in one
  call."
  [rows hydration-key]
  (let [missing  (into [] (keep-indexed (fn [i row] (when (nil? (get row hydration-key)) i))) rows)
        hydrated (when (seq missing)
                   (zipmap missing (t2/hydrate (mapv rows missing) hydration-key)))]
    (vec (map-indexed (fn [i row] (get (get hydrated i row) hydration-key)) rows))))

(defn- split-by-counts
  "`xs` cut into consecutive vectors of the sizes `counts`."
  [counts xs]
  (first (reduce (fn [[acc xs] n] [(conj acc (vec (take n xs))) (drop n xs)])
                 [[] xs]
                 counts)))

(defn- nest-children
  "The `snapshots*` of the `rows` of `model` with the snapshots of their child rows nested under the keys of the
  `:children`, those of all the rows of one kind of child taken together."
  [model rows snapshots*]
  (reduce-kv (fn [acc k {child-model :model, hydration-key :as}]
               (let [children (child-rows rows hydration-key)]
                 (mapv (fn [snapshot child-snapshots]
                         (assoc snapshot k child-snapshots))
                       acc
                       (split-by-counts (map count children) (snapshots child-model (into [] cat children))))))
             snapshots*
             (revisions.spec/children model)))

(defn- snapshots
  "The snapshots of the `rows` of `model`, in order: the tracked columns, with the snapshots of the child rows nested
  under the keys of the `:children`, and the `:id` of a row that belongs to the Revision of a parent."
  [model rows]
  (let [{:keys [track parent snapshot]} (revisions.spec/spec model)
        rows      (vec rows)
        columns   (cond-> (vec track) parent (conj :id))
        snapshots* (nest-children model rows (mapv #(select-keys % columns) rows))]
    (if snapshot
      (snapshot rows snapshots*)
      snapshots*)))

(defn snapshot
  "The snapshot of the `instance` of `model` that a Revision stores."
  [model instance]
  (first (snapshots model [instance])))

(defn changed?
  "Whether `after` differs from `before`, rows or snapshots of `model`, in what a Revision records."
  [model before after]
  (boolean (some #(not (revisions.spec/same? model % before after))
                 (revisions.spec/snapshot-keys model))))

(defn- recorded
  "What the `snapshot` of `model` holds of what a Revision records now, without the keys that older snapshots carry."
  [model snapshot]
  (reduce-kv (fn [m k {child :model}]
               (cond-> m
                 (sequential? (get m k))
                 (update k (fn [rows]
                             (mapv #(apply dissoc % :created_at :updated_at (:skip (revisions.spec/spec child)))
                                   rows)))))
             (select-keys snapshot (revisions.spec/snapshot-keys model))
             (revisions.spec/children model)))

(defn columns-to-revert
  "The tracked columns of `snapshot` that the table of `model` still has, which a revert of the row with `id` writes."
  [model id snapshot]
  (let [valid-columns (set (keys (revisions.db/raw-row model id)))]
    (select-keys snapshot (filter valid-columns (revisions.spec/tracked-columns model)))))

(defn revert-to-revision!
  "Return the row of `model` with `id` to the state that the `snapshot` of a Revision recorded."
  [model id user-id snapshot]
  (let [{:keys [before-revert revert!]} (revisions.spec/spec model)
        snapshot (if before-revert (before-revert id user-id snapshot) snapshot)]
    (when-not revert!
      (throw (ex-info (format "%s has no :revert! in its revisions spec" model) {:model model})))
    (revert! id user-id snapshot)))

(defn- without-skipped
  "The `snapshot` of `model` without the columns that its spec skips, which an older snapshot may still hold."
  [model snapshot]
  (apply dissoc snapshot (:skip (revisions.spec/spec model))))

(defn diff
  "A map describing the difference between the snapshots `before` and `after` of `model`, nil when there is no `before`."
  [model before after]
  (let [{:keys [diff-columns]} (revisions.spec/spec model)]
    (cond
      (nil? before)
      (when diff-columns
        (into {} (map (fn [[k v]] [k {:after v}])) (select-keys after diff-columns)))

      diff-columns
      (into {}
            (keep (fn [column]
                    (when-not (revisions.spec/same? model column before after)
                      [column {:before (get before column) :after (get after column)}])))
            diff-columns)

      :else
      (let [[before after] (data/diff (without-skipped model before) (without-skipped model after))]
        {:before before
         :after  after}))))

(defn describe-columns
  "The strings that describe how the columns of the snapshot `before` of `model` changed into those of `after`,
  naming the Collections and Dashboards they moved between from `names` (see [[readable-names]]), each i18n-ed."
  [model before after names]
  (diff-strings* (name model) before after names))

(defn describe
  "The strings that describe how the snapshot `before` of `model` changed into `after`, by the `:describe` of its spec
  or else [[describe-columns]]."
  [model before after names]
  (if-let [f (:describe (revisions.spec/spec model))]
    (f before after names)
    (describe-columns model before after names)))

(mr/def ::names
  "The names of the Collections, Dashboards and data-test subjects the current user can read, by id, for revision
  descriptions. `:subject-names` is keyed by model, then id."
  [:map {:closed true}
   [:collection-names [:map-of pos-int? :string]]
   [:dashboard-names  [:map-of pos-int? :string]]
   [:subject-names    [:map-of :keyword [:map-of pos-int? :string]]]])

(mu/defn readable-names :- ::names
  "The names of the Collections, Dashboards and data-test subjects that the revision `objects` reference and the
  current user can read, loaded and checked together."
  [objects :- [:sequential [:fn {:error/message "a revision object"} map?]]]
  (let [ids   (fn [k] (into [] (comp (keep k) (filter pos-int?) (distinct)) objects))
        names (fn [rows]
                (into {} (map (juxt :id :name)) (mi/readable rows)))]
    {:collection-names (names (revisions.db/collections-by-ids (ids :collection_id)))
     :dashboard-names  (names (revisions.db/dashboards-by-ids (ids :dashboard_id)))
     :subject-names    (into {}
                             (keep (fn [[k model]]
                                     (when-let [subject-ids (not-empty (ids k))]
                                       [model (names (revisions.db/entities-by-ids model subject-ids))])))
                             revision.diff/data-test-subject-models)}))

(defn revisions-readable?
  "Whether the current user may see each of the revisions whose snapshots are `objects`, as a vector of booleans in
  the order of `objects`. A model whose spec says `:authorize :snapshot` has each snapshot checked on its own terms,
  for its snapshots carry data-permission-sensitive definitions; for any other, whoever can read the current row can
  read its whole history."
  [model objects]
  (if (= :snapshot (:authorize (revisions.spec/spec model)))
    (mapv boolean (map mi/can-read? (t2/hydrate (mapv #(t2/instance model %) objects) :can_read)))
    (mapv (constantly true) objects)))

;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(methodical/defmethod t2/table-name :model/Revision [_model] :revision)

(derive :model/Revision :metabase/model)

;; Not `:hook/events`: that trait would hook every Revision delete, which selects and deserializes each row it removes
;; when a Revision is pruned, and every update and insert. The create event is published by [[publish-created!]].
(defmethod events/spec :model/Revision
  [_model]
  {:create :event/revision-create})

(defn publish-created!
  "Publish the create event of a Revision, within the batch of the write that caused it.
  The event names the entity that the Revision records, by `:model` and `:model_id`, and nothing else: a Dashboard and
  a Card take their last editor and edit time from their latest Revision, which no write of their own rows may have
  changed. Its `:id` is that of the entity, so a batch delivers one event per entity, whichever the order or the number
  of the Revisions inserted."
  [{:keys [model model_id user_id]}]
  (events/collect! {:model     :model/Revision
                    :operation :create
                    :id        (str model ":" model_id)
                    :user-id   user_id
                    :object    {:model model :model_id model_id}}))

(t2/deftransforms :model/Revision
  {:object mi/transform-json})

(declare settle-revisions! create-revision!)

(defn- settle-revisions!*
  "Settle the Revisions of the rows of `items`, `{:model :model_id}` maps, once per row."
  [items]
  (let [entities (into [] (comp (map (juxt :model :model_id)) (distinct)) items)]
    (try
      (settle-revisions! entities)
      (catch Exception e
        (log/errorf "Failed to settle the revisions of %d rows: %s" (count entities) (ex-message e))))))

(defonce ^:private settle-queue
  (delay (grouper/start! #'settle-revisions!*
                         :capacity 500
                         :interval 5000)))

(t2/define-before-insert :model/Revision
  [{:keys [model model_id] :as revision}]
  (mdb/do-after-commit #(grouper/submit! @settle-queue {:model model :model_id model_id}))
  (assoc revision
         :timestamp (or (:timestamp revision) :%now)
         :metabase_version config/mb-version-string
         :most_recent true))

(t2/define-before-update :model/Revision
  [revision]
  (when (seq (dissoc (t2/changes revision) :most_recent))
    (throw (ex-info (tru "You cannot update a Revision!") {:status-code 400})))
  revision)

(t2/define-after-select :model/Revision
  ;; Call the appropriate `post-select` methods (including the type functions) on the `:object` this Revision recorded.
  ;; This is important for things like Card revisions, where the `:dataset_query` property needs to be normalized when
  ;; coming out of the DB.
  [{:keys [model] :as revision}]
  ;; in some cases (such as tests) we have 'fake' models that cannot be resolved normally; don't fail entirely in
  ;; those cases
  (let [model    (u/ignore-exceptions (t2.model/resolve-model (symbol model)))
        defaults (:defaults (revisions.spec/spec model))]
    (cond-> revision
      (and (seq defaults) (map? (:object revision)))
      (update :object #(reduce-kv (fn [object k v] (cond-> object (nil? (get object k)) (assoc k v))) % defaults))

      model (update :object (partial mi/do-after-select model)))))

;;; # Functions

(defn- revision-changes
  [model prev-revision revision names]
  (cond
    (:is_creation revision)  [(deferred-tru "created this")]
    (:is_reversion revision) [(deferred-tru "reverted to an earlier version")]
    ;; We only keep [[revision/max-revisions]] number of revision per entity.
    ;; prev-revision can be nil when we generate description for oldest revision
    (nil? prev-revision)     [(deferred-tru "modified this")]
    :else                    (describe model
                                       (without-skipped model (:object prev-revision))
                                       (without-skipped model (:object revision))
                                       names)))

(defn- revision-description-info
  [model prev-revision revision names]
  (let [changes (revision-changes model prev-revision revision names)]
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
  "Add enriched revision data such as `:diff` and `:description` as well as filter out some unnecessary props, naming
  Collections and Dashboards from `names`, the [[readable-names]] of the two revisions when not given."
  ([model revision prev-revision]
   (add-revision-details model revision prev-revision
                         (readable-names (into [] (keep :object) [revision prev-revision]))))
  ([model revision prev-revision names]
   (-> revision
       (assoc :diff (diff model (:object prev-revision) (:object revision)))
       (merge (revision-description-info model prev-revision revision names))
       ;; add revision user details
       (t2/hydrate :user)
       (update :user select-keys [:id :first_name :last_name :common_name])
       ;; Filter out irrelevant info
       (dissoc :model :model_id :user_id :object))))

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
    (let [visible (t2/hydrate (into []
                                    (comp (filter first) (map second))
                                    (map vector (revisions-readable? model (map :object revisions)) revisions))
                              :user)
          names   (readable-names (into [] (keep :object) visible))]
      (loop [acc [], [r1 r2 & more] visible]
        (if-not r2
          (conj acc (add-revision-details model r1 nil names))
          (recur (conj acc (add-revision-details model r1 r2 names))
                 (conj more r2)))))))

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

(defn- row
  [{:keys [id entity user-id is-creation? message]} serialized-object]
  {:model        (name entity)
   :model_id     id
   :user_id      user-id
   :object       serialized-object
   :is_creation  (boolean is-creation?)
   :is_reversion false
   :message      message})

(mu/defn revision-row :- [:map [:model :string]]
  "The new Revision row of `entity` with `id`, whose caller knows that it changed, for [[create-revisions!]]."
  [{:keys [entity object] :as info} :- PushRevisionInput]
  (row info (snapshot entity object)))

(mu/defn revision-rows :- [:sequential [:map [:model :string]]]
  "The new Revision rows of the entities of one `model` that `infos` describe, as [[revision-row]] makes each, their
  snapshots taken together."
  [model :- [:fn toucan-model?]
   infos :- [:sequential PushRevisionInput]]
  (mapv row infos (snapshots model (mapv :object infos))))

(mu/defn revert!
  "Revert `entity` with `id` to a given Revision."
  [info :- [:map {:closed true}
            [:id          pos-int?]
            [:user-id     pos-int?]
            [:revision-id pos-int?]
            [:entity      [:fn toucan-model?]]]]
  (let [{:keys [id user-id revision-id entity]} info
        model-name (name entity)
        serialized-instance (revisions.db/revision-object model-name id revision-id)]
    (t2/with-transaction [_conn]
      (let [already-in-target-state? (not (changed? entity
                                                    (recorded entity (revisions.db/latest-revision-object model-name id))
                                                    (recorded entity serialized-instance)))
            record-reversion!        #(when-not already-in-target-state?
                                        (u/prog1 (create-revision!
                                                  {:model        model-name
                                                   :model_id     id
                                                   :user_id      user-id
                                                   :object       serialized-instance
                                                   :is_creation  false
                                                   :is_reversion true})
                                          (publish-created! <>)))
            in-batch                 (events/with-event-context {:reverting? true}
                                       (events/with-batched-events
                                         (revert-to-revision! entity id user-id serialized-instance)
                                         [(revisions.db/latest-revision model-name id) (record-reversion!)]))
            [last-revision new-revision] (or in-batch
                                             [(revisions.db/latest-revision model-name id) (record-reversion!)])]
        (if new-revision
          (add-revision-details entity new-revision last-revision)
          last-revision)))))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-revisions!
  "Insert the Revision `rows` in one statement."
  [rows :- [:sequential ::revisions.schema/revision.create]]
  (revisions.db/insert-revisions! rows))

(mu/defn create-revision! :- :map
  "Insert the Revision `row` and return it."
  [row :- ::revisions.schema/revision.create]
  (revisions.db/insert-revision-returning! row))

(mu/defn delete-revisions-for-entity!
  "Delete the Revisions of the row of the model named `model-name` (e.g. \"Card\") with `model-id`."
  [model-name :- :string
   model-id   :- pos-int?]
  (revisions.db/delete-revisions-for-entity! model-name model-id))

(mu/defn delete-revisions-for-entities!
  "Delete the Revisions of the rows of the model named `model-name` (e.g. \"Dashboard\") with `model-ids`."
  [model-name :- :string
   model-ids  :- [:sequential pos-int?]]
  (when (seq model-ids)
    (revisions.db/delete-revisions-for-entities! model-name model-ids)))

(mu/defn settle-revisions!
  "Clear `most_recent` on the superseded Revisions of `entities`, `[model-name model-id]` pairs, and delete their
  Revisions beyond [[max-revisions]]."
  [entities :- [:sequential [:tuple :string pos-int?]]]
  (when (seq entities)
    (revisions.db/unmark-superseded-revisions! entities)
    (revisions.db/delete-revisions-beyond! entities max-revisions)))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/Revision [_model]
  {:skip? false})

(ns metabase.revisions.models.revision
  (:require
   [clojure.data :as data]
   [clojure.walk :as walk]
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as mdb]
   [metabase.batch-processing.core :as grouper]
   [metabase.config.core :as config]
   [metabase.events.core :as events]
   [metabase.lib.schema.util :as lib.schema.util]
   [metabase.models.interface :as mi]
   [metabase.revisions.db :as revisions.db]
   [metabase.revisions.models.revision.diff :as revision.diff :refer [diff-strings*]]
   [metabase.revisions.schema :as revisions.schema]
   [metabase.revisions.spec :as revisions.spec]
   [metabase.util :as u]
   [metabase.util.events :as u.events]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.humanize :as mu.humanize]
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

(defn- invalid-snapshot
  "Throws the 400 for the `snapshot` of `model` that its schema refuses, with what the `explanation` of malli says is
  wrong with it."
  [model snapshot explanation]
  (let [error (mu.humanize/humanize explanation)]
    (throw (ex-info (tru "This revision of a {0} can no longer be restored: {1}" (name model) (pr-str error))
                    {:status-code 400
                     :model       model
                     :snapshot    snapshot
                     :error       error}))))

(defn- snapshot-coercer
  "The function that decodes a snapshot of `model` with the schema of its spec and throws for one that is still invalid."
  [model]
  (let [schema (revisions.spec/schema model)]
    (mr/cached ::snapshot-coercer
               schema
               (fn []
                 (mc/coercer (mr/schema schema)
                             (mtx/transformer {:name :normalize}
                                              {:name :legacy-int-field-ids}
                                              (mtx/strip-extra-keys-transformer)
                                              (mtx/default-value-transformer))
                             identity
                             (fn [error] (invalid-snapshot model (:value error) (:explain error))))))))

(defn normalize-snapshot
  "The `snapshot` of `model` that a Revision stores, decoded with the schema of its spec: the current format of what an
  older format recorded. Throws a 400 for a snapshot that is invalid after that."
  [model snapshot]
  ((snapshot-coercer model) snapshot))

(defn- stripped
  "The `snapshot` of `model` without the top-level keys that its schema does not list, which an older snapshot may
  still hold, for the history of a row, which shows what a Revision recorded; as it is for a model without a spec."
  [model snapshot]
  (if (and snapshot (revisions.spec/schema model))
    (select-keys snapshot (revisions.spec/snapshot-keys model))
    snapshot))

(defn- validate-snapshots!
  "In dev and test, throws when one of the `snapshots` of `model` is not a value of the schema of its spec."
  [model snapshots]
  (when (or config/is-dev? config/is-test?)
    (let [schema (revisions.spec/schema model)]
      (doseq [snapshot snapshots
              :let [error (mr/explain schema snapshot)]
              :when error]
        (throw (ex-info (format "A snapshot of %s is not a %s: %s" model schema
                                (pr-str (mu.humanize/humanize error)))
                        {:model model :snapshot snapshot :error (mu.humanize/humanize error)})))))
  snapshots)

(defn- snapshots
  "The snapshots of the `rows` of `model`, in order, each a value of the schema of its spec: the tracked columns, and
  whatever its `:snapshot` adds."
  [model rows]
  (let [{:keys [track snapshot]} (revisions.spec/spec model)
        rows       (vec rows)
        snapshots* (mapv #(select-keys % track) rows)]
    (validate-snapshots! model (if snapshot
                                 (snapshot rows snapshots*)
                                 snapshots*))))

(defn snapshot
  "The snapshot of the `instance` of `model` that a Revision stores."
  [model instance]
  (first (snapshots model [instance])))

(defn changed?
  "Whether `after` differs from `before`, rows or snapshots of `model`, in what a Revision records."
  [model before after]
  (boolean (some #(not (revisions.spec/same? model % before after))
                 (revisions.spec/snapshot-keys model))))

(defn- revert-snapshot!
  "Return the row of `model` with `id` to the state that the decoded `snapshot` recorded."
  [model id user-id snapshot]
  (let [{:keys [before-revert revert!]} (revisions.spec/spec model)]
    (when-not revert!
      (throw (ex-info (format "%s has no :revert! in its revisions spec" model) {:model model})))
    (revert! id user-id (if before-revert (before-revert id user-id snapshot) snapshot))))

(defn revert-to-revision!
  "Return the row of `model` with `id` to the state that the `snapshot` of a Revision recorded, once decoded with the
  schema of its spec."
  [model id user-id snapshot]
  (revert-snapshot! model id user-id (normalize-snapshot model snapshot)))

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
      (let [[before after] (data/diff (stripped model before) (stripped model after))]
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

(defn publish-created!
  "Publish the create event of the Revisions `rows`, one change per entity that they record, named by `:model` and
  `:model_id` and nothing else: a Dashboard and a Card take their last editor and edit time from their latest Revision,
  which no write of their own rows may have changed."
  [rows]
  (when (seq rows)
    (events/publish-event! :event/revision-create
                           {:changes (u.events/create-changes
                                      (into []
                                            (comp (map #(select-keys % [:model :model_id]))
                                                  (distinct)
                                                  (map #(t2/instance :model/Revision %)))
                                            rows))
                            :user-id (some :user_id rows)})))

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

(defn- settle-after-commit!
  "Queues the settling of the Revisions of the row each of the new Revision `rows` is about, once the write commits."
  [rows]
  (mdb/do-after-commit #(doseq [{:keys [model model_id]} rows]
                          (grouper/submit! @settle-queue {:model model :model_id model_id}))))

(t2/define-before-insert :model/Revision
  [revision]
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
                                       (stripped model (:object prev-revision))
                                       (stripped model (:object revision))
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
  [:map {:closed true}
   [:id                            pos-int?]
   [:object                        ::revisions.db/unregistered-model-object]
   [:entity                        [:fn toucan-model?]]
   [:user-id                       pos-int?]
   [:is-creation? {:optional true} [:maybe :boolean]]
   [:message      {:optional true} [:maybe :string]]])

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

(defn- normalized-or-nil
  "The `snapshot` of `model` decoded with the schema of its spec, nil when it is invalid."
  [model snapshot]
  (try
    (normalize-snapshot model snapshot)
    (catch clojure.lang.ExceptionInfo _ nil)))

(mu/defn revert!
  "Revert `entity` with `id` to a given Revision, refusing with a 400 a Revision whose snapshot cannot be decoded."
  [info :- [:map {:closed true}
            [:id          pos-int?]
            [:user-id     pos-int?]
            [:revision-id pos-int?]
            [:entity      [:fn toucan-model?]]]]
  (let [{:keys [id user-id revision-id entity]} info
        model-name (name entity)
        snapshot   (normalize-snapshot entity (revisions.db/revision-object model-name id revision-id))]
    (t2/with-transaction [_conn]
      (let [already-in-target-state? (not (changed? entity
                                                    (normalized-or-nil entity (revisions.db/latest-revision-object model-name id))
                                                    snapshot))
            record-reversion!        #(when-not already-in-target-state?
                                        (u/prog1 (create-revision!
                                                  {:model        model-name
                                                   :model_id     id
                                                   :user_id      user-id
                                                   :object       snapshot
                                                   :is_creation  false
                                                   :is_reversion true})
                                          (publish-created! [<>])))
            in-batch                 (do (revert-snapshot! entity id user-id snapshot)
                                         [(revisions.db/latest-revision model-name id) (record-reversion!)])
            [last-revision new-revision] (or in-batch
                                             [(revisions.db/latest-revision model-name id) (record-reversion!)])]
        (if new-revision
          (add-revision-details entity new-revision last-revision)
          last-revision)))))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-revisions!
  "Insert the Revision `rows` in one statement."
  [rows :- [:sequential ::revisions.schema/revision.create]]
  (u/prog1 (revisions.db/insert-revisions! rows)
    (settle-after-commit! rows)))

(mu/defn create-revision! :- :map
  "Insert the Revision `row` and return it."
  [row :- ::revisions.schema/revision.create]
  (u/prog1 (revisions.db/insert-revision-returning! row)
    (settle-after-commit! [row])))

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

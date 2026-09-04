(ns metabase-enterprise.remote-sync.core
  (:require
   [java-time.api :as t]
   [medley.core :as m]
   [metabase-enterprise.remote-sync.db :as remote-sync.db]
   [metabase-enterprise.remote-sync.guards :as guards]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.spec :as spec]
   [metabase.api.common :as api]
   [metabase.collections.core :as collections]
   [metabase.events.core :as events]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [potemkin :as p]
   [toucan2.core :as t2]))

(comment
  source/keep-me)

(p/import-vars
 [source]
 [source.p
  ->ingestable])

(defenterprise collection-editable?
  "Determines if a remote-synced collection should be editable.

  Takes a collection to check for editability.

  Returns true if the collection is editable, false otherwise. Returns true when remote-sync-type is :read-write
  or when the collection is not a remote-synced collection. Always returns true on OSS."
  :feature :none
  [collection]
  (or (= (settings/remote-sync-type) :read-write)
      (not (collections/remote-synced-collection? collection))))

(defenterprise table-editable?
  "Determines if a table's metadata should be editable.

  Takes a table to check for editability.

  Returns true if the table is editable, false otherwise. Returns false if:
  - remote-sync-type is :read-only AND
  - table is published AND
  - table is in a remote-synced collection

  Always returns true on OSS.

  If the table has a pre-hydrated :collection key, uses that to avoid an extra query."
  :feature :none
  [table]
  (or (= (settings/remote-sync-type) :read-write)
      (not (:is_published table))
      ;; Use pre-hydrated :collection if available, otherwise fall back to :collection_id
      (not (collections/remote-synced-collection? (or (:collection table)
                                                      (:collection_id table))))))

(defenterprise transforms-editable?
  "Determines if transforms should be editable.

  Returns true if transforms are editable, false otherwise. Transforms are globally
  read-only when remote-sync is enabled and remote-sync-type is :read-only.

  Always returns true on OSS."
  :feature :none
  []
  (or (not (settings/remote-sync-enabled))
      (= (settings/remote-sync-type) :read-write)))

(defenterprise model-editable?
  "Determines if a model instance is editable based on remote sync configuration."
  :feature :none
  [model-key instance]
  (spec/model-editable? model-key instance))

(defenterprise batch-model-editable?
  "Batch version of model-editable?. Returns a map of instance-id -> editable? boolean."
  :feature :none
  [model-key instances]
  (spec/batch-model-editable? model-key instances))

(defenterprise batch-model-eligible?
  "Batch check if model instances are eligible for remote sync based on spec rules.
   Returns a map of instance-id -> eligible? boolean."
  :feature :none
  [model-key instances]
  (if-let [spec (spec/spec-for-model-key model-key)]
    (spec/batch-check-eligibility spec instances)
    (into {} (map (fn [inst] [(:id inst) false])) instances)))

(defn- record-removed-rsos!
  "Records a pending removal on the RemoteSyncObject rows of the given collections and their contents, so
  the next export deletes them from the remote. Rows still in 'create' (never pushed) are dropped outright
  — the remote never received them, so there is nothing to delete there."
  [collection-ids]
  (let [rows (remote-sync.db/content-rso-statuses collection-ids)
        {created true tracked false} (group-by #(= "create" (:status %)) rows)]
    (when (seq created)
      (remote-sync.db/delete-rsos! (map :id created)))
    (when (seq tracked)
      (remote-sync.db/set-rsos-status! (map :id tracked) "removed" (t/offset-date-time)))))

(defn- restore-removed-rsos!
  "Clears any pending 'removed' status on the given collections' and contents' RemoteSyncObject rows when the
  collections are re-synced, so the next export does not delete them from the remote. This targets every
  'removed' row in the subtree regardless of what recorded it (typically [[record-removed-rsos!]] from an
  earlier un-sync, but also e.g. an unpublished table's pending removal).

  Restores to 'update' rather than 'synced': edits made while the collection was un-synced are not tracked,
  so the entity must be re-serialized for the remote to be guaranteed to match local."
  [collection-ids]
  (when-let [ids (seq (remote-sync.db/removed-content-rso-ids collection-ids))]
    (remote-sync.db/set-rsos-status! ids "update" (t/offset-date-time))))

(defn- collection-content-specs
  "Specs for entities tracked by living directly in a remote-synced collection (Card, Dashboard, Document,
  Timeline) — eligibility keyed on the collection being remote-synced, so they carry a collection_id."
  []
  (filter #(= :remote-synced (get-in % [:eligibility :collection])) (vals spec/remote-sync-specs)))

(defn- track-untracked-contents!
  "Inserts a 'create' RemoteSyncObject row for every eligible content entity in `collection-ids` that has
  none — e.g. a never-pushed card whose 'create' row was dropped when its collection was previously
  un-synced. Without this a re-enabled collection's untracked contents would be omitted by the next
  (incremental) export. The RemoteSyncObject table only records pending changes, so already-synced content
  is legitimately absent; re-marking it 'create' re-serializes it harmlessly (a 'create' onto its own path
  stays a no-op)."
  [collection-ids]
  (doseq [{:keys [model-key model-type archived-key] :as spec} (collection-content-specs)
          :let  [tracked  (remote-sync.db/tracked-model-ids model-type)
                 entities (remote-sync.db/instances-in-collections model-key collection-ids archived-key)]
          entity entities
          :when  (not (contains? tracked (:id entity)))]
    (remote-sync.db/insert-rso!
     (merge {:model_type        model-type
             :model_id          (:id entity)
             :status            "create"
             :status_changed_at (t/offset-date-time)}
            (spec/build-sync-object-fields spec entity)))))

(defn- collections-by-id
  "`{id collection}` for `ids`, carrying the fields the failure descriptions need. Nil and duplicate ids
  are tolerated so callers can pass raw `:collection_id`s straight from the entities they described."
  [ids]
  (when-let [ids (not-empty (disj (set ids) nil))]
    (remote-sync.db/collections-by-id ids)))

(defn- top-level-ancestor-id
  "Id of the outermost collection containing `collection`."
  [{:keys [id location]}]
  (or (first (collections/location-path->ids location)) id))

(def ^:private model-name->collection-item-model
  "Toucan model name -> the model string the collections API uses for the same entity, so clients can
  reuse their existing icon, label and link handling."
  {"Card"               "card"
   "Collection"         "collection"
   "Dashboard"          "dashboard"
   "Document"           "document"
   "NativeQuerySnippet" "snippet"
   "Timeline"           "timeline"})

(defn- dependency-item-model
  "The model string clients should use for `model-name`. Anything outside
  [[model-name->collection-item-model]] degrades to the lowercased Toucan name — the convention the rest
  of the remote-sync API already uses for entities the collections API has no item model for — so this
  never puts a `nil` model on the wire."
  [model-name]
  (get model-name->collection-item-model model-name (u/lower-case-en model-name)))

(defn- entity-names
  "`{[model-name id] name}` for `entities`. A separate select rather than widening the eligibility select,
  which is shared with the dependents path and sees models that have no `:name`."
  [entities]
  (into {}
        (for [[model-name group] (group-by :model entities)
              row (remote-sync.db/instance-names (keyword "model" model-name) (map :id group))]
          [[model-name (:id row)] (:name row)])))

(defn- card-item-details
  "`{card-id {:model model :display display}}` for the Cards in `entities`. Their `type` is what separates
  questions from models and metrics, and `display` is what lets clients show a question's visualization
  icon instead of a generic one; the eligibility select carries neither."
  [entities]
  (when-let [ids (seq (keep #(when (= "Card" (:model %)) (:id %)) entities))]
    (into {}
          (map (fn [{:keys [id type display]}]
                 [id {:model   (case (keyword type)
                                 :model  "dataset"
                                 :metric "metric"
                                 "card")
                      ;; Named for the wire, as the dirty-changes payload already does for `display`.
                      :display (some-> display name)}]))
          ;; :card_schema is required alongside :type — selecting it runs Card's schema upgrades.
          (remote-sync.db/card-types ids))))

(defn- describe-entities
  "`[{:model :id :name}]` for `entities`, which are `{:model \"Card\" :id 412}` maps, in the order given.
  Cards carry `:display` too, so clients can pick the visualization icon."
  [entities]
  (let [names        (entity-names entities)
        card-details (card-item-details entities)]
    (mapv (fn [{:keys [model id]}]
            ;; Keyed by id alone, so only consult it once the entity is known to be a Card.
            (let [card (when (= "Card" model) (get card-details id))]
              (cond-> {:model (if (= "Card" model)
                                (:model card "card")
                                (dependency-item-model model))
                       :id    id
                       :name  (get names [model id])}
                (:display card) (assoc :display (:display card)))))
          entities)))

(defn- remedy-collection
  "The collection a remedy points at, as clients need it: enough to name the row, switch it on, and pick
  the same icon the collection would get anywhere else."
  [collection]
  {:id       (:id collection)
   :name     (:name collection)
   :type     (:type collection)
   :personal (some? (:personal_owner_id collection))})

(defn- sync-remedy
  "What an admin would have to sync for `dep` to be covered: a specific top-level collection, or
  `:library` for models whose eligibility keys on the Library (snippets) on an instance that hasn't got
  one yet — there being no collection to name. The Library itself is an ordinary top-level collection,
  so once it exists it is reported as one. `:none` when the dependency lives outside any collection."
  [{:keys [model instance]} collections top-levels library]
  (let [top (some->> (:collection_id instance)
                     (get collections)
                     top-level-ancestor-id
                     (get top-levels))]
    (cond
      (= :library-synced (get-in (spec/spec-for-model-key (keyword "model" model)) [:eligibility :type]))
      (if library
        {:type       :collection
         :collection (remedy-collection library)}
        {:type :library})

      top
      {:type       :collection
       :collection (remedy-collection top)}

      :else
      {:type :none})))

(defn- dependency-collection
  "Where the dependency lives, as a map to merge into its description. An explicit `nil` says the root
  collection — a real place, not a missing value — while an absent key says we could not resolve the
  collection at all, so clients don't read one as the other."
  [{:keys [collection_id]} collections]
  (if collection_id
    (when-let [collection (get collections collection_id)]
      {:collection (select-keys collection [:id :name])})
    {:collection nil}))

(defn- referencing-entities
  "`[model-name id]` pairs naming the entities that reference `dep`, in the order the traversal found them.
  Nested models (DashboardCard, DashboardCardSeries, Action) fall away as they do for dependents — they
  have no name of their own, and the parent that does is in the same path."
  [dep]
  (distinct (for [path            (:used-by dep)
                  [model-name id] path
                  :when           (contains? model-name->collection-item-model model-name)]
              [model-name id])))

(defn- describe-used-by
  "The rendered `:used-by` of each dependency in `deps`, positionally. Names resolve in a single pass over
  the whole set, so a refusal naming dozens of dependencies costs the same few selects as one naming a
  single dependency."
  [deps]
  (let [entities  (vec (distinct (mapcat referencing-entities deps)))
        described (zipmap entities
                          (describe-entities (mapv (fn [[model-name id]] {:model model-name :id id})
                                                   entities)))]
    (mapv #(mapv described (referencing-entities %)) deps)))

(defn- dependency-key
  "Identity of a dependency in the traversal's own terms, which is how [[referencing-entities]] names it."
  [{:keys [model id]}]
  [model id])

(defn- subsumed-dependency?
  "Whether reporting `dep` would tell an admin nothing new: everything that reaches it is itself an
  ineligible dependency whose remedy is the same, so the row that fixes it is already on screen. Click
  behaviour pointing at an unsynced dashboard drags in every card that dashboard holds, and those cards
  are covered by syncing the dashboard's collection. A referrer with a *different* remedy doesn't
  subsume — that one needs its own row, or the next save is refused for a reason never shown."
  [dep remedies]
  (when-let [referrers (seq (referencing-entities dep))]
    (let [remedy (get remedies (dependency-key dep))]
      ;; Referrers outside `remedies` are eligible content, so they never subsume.
      (every? #(= remedy (get remedies %)) referrers))))

(defn- describe-dependencies
  "Renders [[collections/ineligible-dependencies]] for the API: what each dependency is, the collection it
  lives in, the entities that reference it, and the collection (or the Library) that would have to be
  synced to cover it. Dependencies the traversal only reached through another one with the same remedy
  are dropped — see [[subsumed-dependency?]]."
  [deps]
  (let [collections (collections-by-id (map (comp :collection_id :instance) deps))
        top-levels  (collections-by-id (map top-level-ancestor-id (vals collections)))
        ;; Resolved once for the whole refusal rather than per snippet dependency.
        library     (collections/library-collection)
        remedies    (zipmap (map dependency-key deps)
                            (map #(sync-remedy % collections top-levels library) deps))
        reported    (into [] (remove #(subsumed-dependency? % remedies)) deps)]
    (mapv (fn [described used-by {:keys [instance] :as dep}]
            (merge described
                   {:remedy  (get remedies (dependency-key dep))
                    :used_by used-by}
                   (dependency-collection instance collections)))
          (describe-entities reported)
          (describe-used-by reported)
          reported)))

(defn- describe-dependents
  "Renders [[collections/remote-synced-dependents]] for the API. Each dependent arrives as a path map like
  `{\"DashboardCard\" 12 \"Dashboard\" 3}`; every entry an admin can actually open is reported, and the
  nested models (DashboardCard, DashboardCardSeries, Action) fall away — they have no name of their own,
  and the parent that does is in the same path."
  [dependents]
  (describe-entities
   (vec (distinct (for [dependent       dependents
                        [model-name id] dependent
                        :when           (contains? model-name->collection-item-model model-name)]
                    {:model model-name :id id})))))

(defn- unsynced-dependency-failures
  "For each collection being synced on, the dependencies that syncing it would leave outside remote sync.
  Unlike [[collections/check-non-remote-synced-dependencies]] this reports every offending collection
  rather than throwing on the first, so an admin sees the whole picture in one pass. Realized eagerly:
  eligibility only reads correctly against the pending updates, so nothing may be left for
  [[describe-required-syncs]] to force after the transaction rolls back."
  [collections-to-sync]
  (vec
   (for [collection collections-to-sync
         :let  [deps (collections/ineligible-dependencies collection)]
         :when (seq deps)]
     {:collection collection :dependencies deps})))

(defn- remote-synced-dependent-failure
  "The first collection being synced off that remote-synced content still depends on, if any. Stops at the
  first, unlike [[unsynced-dependency-failures]]: every [[collections/remote-synced-dependents]] call
  traverses every remote-synced root, and the admin's remedy is the same however many collections are at
  fault — leave them synced."
  [collections-to-unsync]
  (first
   (for [collection collections-to-unsync
         :let  [dependents (collections/remote-synced-dependents collection)]
         :when (seq dependents)]
     {:collection collection :dependents (vec dependents)})))

(defn- group-remedy
  "The remedy an entry is keyed on. A `:none` remedy carries the collection the dependency lives in —
  the only one there is to name — keeping that key's own distinction, where nil is the root collection
  and an absent key is a collection we could not resolve."
  [{:keys [remedy] :as described}]
  (if (= :none (:type remedy))
    (cond-> remedy
      (contains? described :collection) (assoc :collection (:collection described)))
    remedy))

(defn- remedy-syncable?
  "Whether an admin can switch this remedy on from the settings list. A personal collection is named so
  the refusal makes sense, but it can never be synced."
  [{:keys [type collection]}]
  (boolean (and (= :collection type) (not (:personal collection)))))

(defn- describe-required-syncs
  "The refusal as clients render it: one entry per collection an admin would act on, carrying the
  dependencies it covers and the selected collections it unblocks. Grouping by remedy rather than by
  selection is what collapses a dependency that blocks two selected collections into a single entry."
  [failures]
  (let [entries   (vec (for [{:keys [collection dependencies]} failures
                             described (describe-dependencies dependencies)]
                         {:remedy (group-remedy described)
                          :blocks (select-keys collection [:id :name])
                          :dep    (dissoc described :remedy)}))
        by-remedy (group-by :remedy entries)]
    ;; Ordered by first appearance rather than by `group-by`, whose order isn't guaranteed.
    (mapv (fn [remedy]
            (let [group (get by-remedy remedy)]
              {:remedy       remedy
               :syncable     (remedy-syncable? remedy)
               :blocks       (vec (distinct (map :blocks group)))
               :dependencies (into [] (m/distinct-by (juxt :model :id)) (map :dep group))}))
          (distinct (map :remedy entries)))))

(defn- describe-dependent-failure
  [{:keys [collection dependents]}]
  {:collection (select-keys collection [:id :name])
   :dependents (describe-dependents dependents)})

(defn- rejection
  "Turns the marker [[bulk-set-remote-sync]] throws out of its transaction into the 400 the API returns.
  Describing a failure takes several more selects, and they run here — after the rollback — rather than
  under the row locks the transaction was holding. Returns nil for anything else, which propagates as-is."
  [e]
  (let [{::keys [unsynced-dependencies remote-synced-dependents]} (ex-data e)]
    (cond
      unsynced-dependencies
      (ex-info (ex-message e)
               {:status-code 400
                :error_code  "unsynced-dependencies"
                :errors      {:required (describe-required-syncs unsynced-dependencies)}})

      remote-synced-dependents
      (ex-info (ex-message e)
               {:status-code 400
                :error_code  "remote-synced-dependents"
                :errors      {:collections [(describe-dependent-failure remote-synced-dependents)]}}))))

(mu/defn bulk-set-remote-sync :- :nil
  "Sets remote sync to true/false on one or collections in a single transaction. Checks that the remote sync state
  afterwards is consistent in terms of dependency rules. Collections are provided as a map of collection-id -> sync state."
  [collection-states :- [:map-of pos-int? :boolean]]
  (guards/ensure-no-active-task!)
  (let [{:keys [sync-on sync-off]} (-> (reduce-kv (fn [sync-states collection-id sync-state]
                                                    (if sync-state
                                                      (update sync-states :sync-on conj collection-id)
                                                      (update sync-states :sync-off conj collection-id)))
                                                  {:sync-on #{} :sync-off #{}}
                                                  collection-states)
                                       (update :sync-on #(when-let [sync-on (seq %)]
                                                           (remote-sync.db/collections sync-on)))
                                       (update :sync-off #(when-let [sync-off (seq %)]
                                                            (remote-sync.db/collections sync-off))))]
    (try
      (t2/with-transaction [_]
        (when (seq sync-on)
          (remote-sync.db/mark-subtree-remote-synced! sync-on)
          (when-let [ids (seq (remote-sync.db/subtree-collection-ids sync-on))]
            ;; Re-syncing before a recorded removal was pushed must not leave the contents marked for deletion.
            (restore-removed-rsos! ids)
            ;; ...and contents that were dropped outright (never-pushed 'create' rows) must be re-tracked, so
            ;; the next export pushes them rather than silently omitting them.
            (track-untracked-contents! ids)))
        (when (seq sync-off)
          (let [affected-collection-ids (remote-sync.db/remote-synced-subtree-collection-ids sync-off)]
            (when (seq affected-collection-ids)
              (remote-sync.db/unmark-collections-remote-synced! affected-collection-ids)
              (record-removed-rsos! affected-collection-ids))))
        (when-let [failures (not-empty (unsynced-dependency-failures sync-on))]
          (throw (ex-info (tru "Uses content that is not remote synced.")
                          {::unsynced-dependencies failures})))
        (when-let [failure (remote-synced-dependent-failure sync-off)]
          (throw (ex-info (tru "Used by remote synced content.")
                          {::remote-synced-dependents failure}))))
      (catch clojure.lang.ExceptionInfo e
        (throw (or (rejection e) e))))
    (doseq [collection sync-on
            ;; only publish event when this changed
            :when (not (:is_remote_synced collection))]
      (events/publish-event! :event/collection-update
                             ;; collection is the model originally loaded set the correct sync state
                             {:object (assoc collection :is_remote_synced true)
                              :user-id api/*current-user-id*}))
    (doseq [collection sync-off
            ;; only publish event when this changed
            :when (:is_remote_synced collection)]
      (events/publish-event! :event/collection-update
                             ;; collection is the model originally loaded set the correct sync state
                             {:object (assoc collection :is_remote_synced false)
                              :user-id api/*current-user-id*}))))

(ns metabase-enterprise.remote-sync.core
  (:require
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.guards :as guards]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.spec :as spec]
   [metabase.api.common :as api]
   [metabase.collections.core :as collections]
   [metabase.events.core :as events]
   [metabase.premium-features.core :refer [defenterprise]]
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

(defn- subtree-where
  "HoneySQL predicate matching `collections` and all of their descendants."
  [collections]
  (into [:or [:in :id (map :id collections)]]
        (for [collection collections]
          [:like :location (str (collections/location-path collection) "%")])))

(defn- contents-rso-where
  "HoneySQL predicate matching the RemoteSyncObject rows of `collection-ids` and of their contents."
  [collection-ids]
  [:or
   [:and [:= :model_type "Collection"] [:in :model_id collection-ids]]
   [:in :model_collection_id collection-ids]])

(defn- record-removed-rsos!
  "Records a pending removal on the RemoteSyncObject rows of the given collections and their contents, so
  the next export deletes them from the remote. Rows still in 'create' (never pushed) are dropped outright
  — the remote never received them, so there is nothing to delete there."
  [collection-ids]
  (let [rows (t2/select [:model/RemoteSyncObject :id :status] {:where (contents-rso-where collection-ids)})
        {created true tracked false} (group-by #(= "create" (:status %)) rows)]
    (when (seq created)
      (t2/delete! :model/RemoteSyncObject :id [:in (map :id created)]))
    (when (seq tracked)
      (t2/update! :model/RemoteSyncObject :id [:in (map :id tracked)]
                  {:status "removed" :status_changed_at (t/offset-date-time)}))))

(defn- restore-removed-rsos!
  "Clears any pending 'removed' status on the given collections' and contents' RemoteSyncObject rows when the
  collections are re-synced, so the next export does not delete them from the remote. This targets every
  'removed' row in the subtree regardless of what recorded it (typically [[record-removed-rsos!]] from an
  earlier un-sync, but also e.g. an unpublished table's pending removal).

  Restores to 'update' rather than 'synced': edits made while the collection was un-synced are not tracked,
  so the entity must be re-serialized for the remote to be guaranteed to match local."
  [collection-ids]
  (when-let [ids (seq (t2/select-pks-set :model/RemoteSyncObject
                                         {:where [:and
                                                  [:= :status "removed"]
                                                  (contents-rso-where collection-ids)]}))]
    (t2/update! :model/RemoteSyncObject :id [:in ids]
                {:status "update" :status_changed_at (t/offset-date-time)})))

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
          :let  [tracked  (t2/select-fn-set :model_id :model/RemoteSyncObject :model_type model-type)
                 where    (if archived-key
                            [:and [:in :collection_id collection-ids] [:= archived-key false]]
                            [:in :collection_id collection-ids])
                 entities (t2/select model-key {:where where})]
          entity entities
          :when  (not (contains? tracked (:id entity)))]
    (t2/insert! :model/RemoteSyncObject
                (merge {:model_type        model-type
                        :model_id          (:id entity)
                        :status            "create"
                        :status_changed_at (t/offset-date-time)}
                       (spec/build-sync-object-fields spec entity)))))

(defn- collections-by-id
  [ids]
  (when-let [ids (seq (distinct (remove nil? ids)))]
    (into {}
          (map (juxt :id identity))
          (t2/select [:model/Collection :id :name :location :personal_owner_id] :id [:in ids]))))

(defn- top-level-ancestor-id
  "Id of the outermost collection containing `collection`. Remote sync settings only offers top-level
  collections as sync targets, so this — not the entity's own collection — is what an admin can act on.
  A top-level collection is its own ancestor."
  [{:keys [id location]}]
  (or (first (collections/location-path->ids location)) id))

(defn- dependency-names
  "`{[model-name id] name}` for `deps`. A separate select rather than widening the eligibility select,
  which is shared with the dependents path and sees models that have no `:name`."
  [deps]
  (into {}
        (for [[model-name group] (group-by :model deps)
              row (t2/select [(keyword "model" model-name) :id :name] :id [:in (map :id group)])]
          [[model-name (:id row)] (:name row)])))

(def ^:private model-name->collection-item-model
  "Toucan model name -> the model string the collections API uses for the same entity, so clients can
  reuse their existing icon, label and link handling. Cards refine further in [[card-item-models]]."
  {"Card"               "card"
   "Dashboard"          "dashboard"
   "Document"           "document"
   "NativeQuerySnippet" "snippet"
   "Timeline"           "timeline"})

(defn- card-item-models
  "`{card-id model}` for the Cards in `deps` — only their `type` separates questions from models and
  metrics, and the eligibility select doesn't carry it."
  [deps]
  (when-let [ids (seq (keep #(when (= "Card" (:model %)) (:id %)) deps))]
    (into {}
          (map (fn [{:keys [id type]}]
                 [id (case (keyword type)
                       :model  "dataset"
                       :metric "metric"
                       "card")]))
          ;; :card_schema is required alongside :type — selecting it runs Card's schema upgrades.
          (t2/select [:model/Card :id :type :card_schema] :id [:in ids]))))

(defn- sync-remedy
  "What an admin would have to sync for `dep` to be covered: a specific top-level collection, or the
  Library for models whose eligibility keys on it (snippets) rather than on their own collection.
  `:none` when the dependency lives outside any collection."
  [{:keys [model instance]} collections top-levels]
  (if (= :library-synced (get-in (spec/spec-for-model-key (keyword "model" model)) [:eligibility :type]))
    {:type :library}
    (if-let [top (some->> (:collection_id instance)
                          (get collections)
                          top-level-ancestor-id
                          (get top-levels))]
      {:type       :collection
       :collection {:id       (:id top)
                    :name     (:name top)
                    :personal (some? (:personal_owner_id top))}}
      {:type :none})))

(defn- describe-dependencies
  "Renders [[collections/ineligible-dependencies]] for the API: what each dependency is, the collection it
  lives in, and the collection (or the Library) that would have to be synced to cover it."
  [deps]
  (let [names       (dependency-names deps)
        card-models (card-item-models deps)
        collections (collections-by-id (map (comp :collection_id :instance) deps))
        top-levels  (collections-by-id (map top-level-ancestor-id (vals collections)))]
    (mapv (fn [{:keys [model id instance] :as dep}]
            (cond-> {:model  (if (= "Card" model)
                               (get card-models id "card")
                               (model-name->collection-item-model model))
                     :id     id
                     :name   (get names [model id])
                     :remedy (sync-remedy dep collections top-levels)}
              (:collection_id instance)
              (assoc :collection (select-keys (get collections (:collection_id instance)) [:id :name]))))
          deps)))

(defn- non-remote-synced-dependency-failures
  "For each collection being synced on, the dependencies that syncing it would leave outside remote sync.
  Unlike [[collections/check-non-remote-synced-dependencies]] this reports every offending collection
  rather than throwing on the first, so an admin sees the whole picture in one pass."
  [collections-to-sync]
  (vec
   (for [collection collections-to-sync
         :let  [deps (collections/ineligible-dependencies collection)]
         :when (seq deps)]
     {:collection   (select-keys collection [:id :name])
      :dependencies (describe-dependencies deps)})))

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
                                                           (t2/select :model/Collection :id [:in sync-on])))
                                       (update :sync-off #(when-let [sync-off (seq %)]
                                                            (t2/select :model/Collection :id [:in sync-off]))))]
    (t2/with-transaction [_]
      (when (seq sync-on)
        (t2/query {:update (t2/table-name :model/Collection)
                   :set {:is_remote_synced true}
                   :where [:and
                           [:= :is_remote_synced false]
                           (subtree-where sync-on)]})
        (when-let [ids (seq (t2/select-pks-set :model/Collection {:where (subtree-where sync-on)}))]
          ;; Re-syncing before a recorded removal was pushed must not leave the contents marked for deletion.
          (restore-removed-rsos! ids)
          ;; ...and contents that were dropped outright (never-pushed 'create' rows) must be re-tracked, so
          ;; the next export pushes them rather than silently omitting them.
          (track-untracked-contents! ids)))
      (when (seq sync-off)
        (let [affected-collection-ids
              (t2/select-pks-set :model/Collection
                                 {:where [:and
                                          [:= :is_remote_synced true]
                                          (subtree-where sync-off)]})]
          (when (seq affected-collection-ids)
            (t2/query {:update (t2/table-name :model/Collection)
                       :set {:is_remote_synced false}
                       :where [:in :id affected-collection-ids]})
            (record-removed-rsos! affected-collection-ids))))
      (when-let [failures (seq (non-remote-synced-dependency-failures sync-on))]
        (throw (ex-info (tru "Uses content that is not remote synced.")
                        {:status-code 400
                         :error_code  "unsynced-dependencies"
                         :errors      {:collections (vec failures)}})))
      (doseq [collection sync-off]
        (collections/check-remote-synced-dependents collection)))
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

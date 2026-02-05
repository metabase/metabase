(ns metabase-enterprise.remote-sync.core
  (:require
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.spec :as spec]
   [metabase.api.common :as api]
   [metabase.collections.core :as collections]
   [metabase.events.core :as events]
   [metabase.premium-features.core :refer [defenterprise]]
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

(mu/defn bulk-set-remote-sync :- :nil
  "Sets remote sync to true/false on one or collections in a single transaction. Checks that the remote sync state
  afterwards is consistent in terms of dependency rules. Collections are provided as a map of collection-id -> sync state."
  [collection-states :- [:map-of pos-int? :boolean]]
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
                           (into [:or [:in :id (map :id sync-on)]]
                                 (for [collection sync-on]
                                   [:like :location (str (collections/location-path collection) "%")]))]}))
      (when (seq sync-off)
        (t2/query {:update (t2/table-name :model/Collection)
                   :set {:is_remote_synced false}
                   :where [:and
                           [:= :is_remote_synced true]
                           (into [:or [:in :id (map :id sync-off)]]
                                 (for [collection sync-off]
                                   [:like :location (str (collections/location-path collection) "%")]))]}))
      (doseq [collection sync-on]
        (collections/check-non-remote-synced-dependencies collection))
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

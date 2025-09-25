(ns metabase-enterprise.remote-sync.models.remote-sync-change-log
  (:require
   [metabase.collections.models.collection :as collection]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/RemoteSyncChangeLog [_model] :remote_sync_change_log)

(derive :model/RemoteSyncChangeLog :metabase/model)

(t2/define-after-insert :model/RemoteSyncChangeLog
  [{:keys [id model_type model_entity_id] :as entry}]
  (u/prog1 entry
    (t2/update! :model/RemoteSyncChangeLog
                {:model_type model_type :model_entity_id model_entity_id :id [:<> id]}
                {:most_recent false})))

(defn- last-sync-at
  "A timestamp of the most recent import or export for a given collection. If given a non-root collection
  (a collection whose location is not \"/\"), find the root collection use that to grab the last sync.

  Arguments:
    col-or-id: the collection or the id of a collection to find the last sync for

  Returns:
    timestamp of the last sync for the collection (either import or export)."
  [col-or-id]
  (let [location (if (map? col-or-id) (:location col-or-id) (t2/select-one-fn :location :model/Collection :id col-or-id))
        root-col-id (if (= location "/") (u/the-id col-or-id) (first (collection/location-path->ids location)))]
    (t2/select-one-fn :created_at :model/RemoteSyncChangeLog
                      {:where [:and
                               [:= :c.id root-col-id]
                               [:= :status [:inline "success"]]
                               [:or
                                [:= :sync_type [:inline "import"]]
                                [:= :sync_type [:inline "export"]]]]
                       :inner-join [[:collection :c]
                                    [:and
                                     [:= :c.entity_id :model_entity_id]
                                     [:= :model_type [:inline "Collection"]]]]
                       :order-by [[:remote_sync_change_log.created_at :desc]]})))

(def ^:private synced-models
  {:collection "Collection" :report_card "Card" :document "Document" :report_dashboard "Dashboard" :native_query_snippet "NativeQuerySnippet"})

(defn ^:private exists-select
  [_k]
  [[[:inline 1] :dummy]])

(def ^:private items-select
  {:collection [:collection.id
                :collection.name
                :collection.created_at
                :collection.authority_level
                [:collection.id :collection_id]
                [nil :display]
                [nil :query_type]
                [nil :description]
                [nil :updated_at]
                [[:inline "collection"] :model]
                [:rs_change_log.sync_type :sync_status]]
   :report_card [:report_card.id
                 :report_card.name
                 :report_card.created_at
                 [nil :authority_level]
                 :report_card.collection_id
                 :report_card.display
                 :report_card.query_type
                 :report_card.description
                 :report_card.updated_at
                 [[:inline "card"] :model]
                 [:rs_change_log.sync_type :sync_status]]
   :document [:document.id
              :document.name
              :document.created_at
              [nil :authority_level]
              :document.collection_id
              [nil :display]
              [nil :query_type]
              [nil :description]
              :document.updated_at
              [[:inline "document"] :model]
              [:rs_change_log.sync_type :sync_status]]
   :report_dashboard [:report_dashboard.id
                      :report_dashboard.name
                      :report_dashboard.created_at
                      [nil :authority_level]
                      :report_dashboard.collection_id
                      [nil :display]
                      [nil :query_type]
                      :report_dashboard.description
                      :report_dashboard.updated_at
                      [[:inline "dashboard"] :model]
                      [:rs_change_log.sync_type :sync_status]]
   :native_query_snippet [:native_query_snippet.id
                          :native_query_snippet.name
                          :native_query_snippet.created_at
                          [nil :authority_level]
                          :native_query_snippet.collection_id
                          [nil :display]
                          [nil :query_type]
                          [nil :description]
                          :native_query_snippet.updated_at
                          [[:inline "snippet"] :model]
                          [:rs_change_log.sync_type :sync_status]]})

(defn- dirty-collection
  "A honeysql select statement that returns dirty children of a collection or any sub items of this collection.

  Arguments:
    col-or-id (optional): the colleciton or the id of the collection to check, if omitted checks for any dirty
      items in any remote-synced root
    selection-options: mapping of model-type->honeysql for the select clause of the options

  Returns:
    the count of dirty objects in this collection"

  ([select-options]
   (some->> (t2/select :model/Collection :type "remote-synced" :location "/")
            (map #(dirty-collection % select-options))
            (keep :union-all)
            not-empty
            (mapcat identity)
            (assoc nil :union-all)))
  ([col-or-id select-options]
   (when-let [{col-id :id
               location :location
               :as col} (if (map? col-or-id)
                          col-or-id
                          (t2/select-one :model/Collection :id col-or-id))]
     (let [last-sync (last-sync-at col)
           queries (mapv (fn [[table entity-type]]
                           (let [entity-id-col (keyword (str (name table) ".entity_id"))]
                             {:select (select-options table)
                              :from [table]
                              :join (cond-> [[:remote_sync_change_log :rs_change_log]
                                             [:and
                                              [:= :rs_change_log.model_entity_id entity-id-col]
                                              [:= :rs_change_log.most_recent [:inline true]]
                                              [:= :rs_change_log.model_type [:inline entity-type]]]]
                                      (not= table :collection) (into [[:collection]
                                                                      [:= (keyword (str (name table) ".collection_id")) :collection.id]]))
                              :where [:and [:or
                                            [:= :collection.id col-id]
                                            [:like :collection.location [:inline (str location col-id "/%")]]]
                                      (when last-sync
                                        [:> :rs_change_log.created_at last-sync])]}))
                         synced-models)]
       {:union-all queries}))))

(defn dirty-collection?
  "A boolean value reporting if the given collection has changes since the last sync

  Arguments:
    col-id: the id of the collection to check

  Returns:
    boolean if the collection has changes or not"
  [col-id]
  (boolean
   (when-let [dirty-query (dirty-collection col-id exists-select)]
     (:exists (t2/query-one {:select [[[:exists dirty-query] :exists]]})))))

(defn dirty-for-collection
  "All models for collection that are dirty along with a note about why their state is dirty

  Arguments:
    col-id: the id of the collection to check

  Returns:
    seq of models that have changed since the last remote sync"
  [col-id]
  (when-let [dirty-query (dirty-collection col-id items-select)]
    (t2/query dirty-query)))

(defn dirty-global?
  "A boolean value reporting if any collection has changes since the last sync

  Returns:
    boolean if the collection has changes or not"
  []
  (boolean
   (when-let [dirty-query (dirty-collection exists-select)]
     (:exists (t2/query-one {:select [[[:exists dirty-query] :exists]]})))))

(defn dirty-for-global
  "All models for any collection that are dirty along with a note about why their state is dirty

  Returns:
    seq of models that have changed since the last remote sync"
  []
  (when-let [dirty-query (dirty-collection items-select)]
    (t2/query dirty-query)))

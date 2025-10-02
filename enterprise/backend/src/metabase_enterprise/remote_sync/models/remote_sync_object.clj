(ns metabase-enterprise.remote-sync.models.remote-sync-object
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/RemoteSyncObject [_model] :remote_sync_object)

(derive :model/RemoteSyncObject :metabase/model)

(def ^:private synced-models
  {:collection "Collection" :report_card "Card" :document "Document" :report_dashboard "Dashboard" :native_query_snippet "NativeQuerySnippet"})

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
                [:rs_obj.status :sync_status]]
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
                 [:rs_obj.status :sync_status]]
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
              [:rs_obj.status :sync_status]]
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
                      [:rs_obj.status :sync_status]]
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
                          [:rs_obj.status :sync_status]]})

(defn- dirty
  "A honeysql select statement that returns dirty children of a collection or any sub items of this collection.

  Arguments:
    selection-options: mapping of model-type->honeysql for the select clause of the options

  Returns:
    the count of dirty objects in this collection"
  [select-options]
  (let [queries (mapv (fn [[table entity-type]]
                        (let [id-col (keyword (str (name table) ".id"))]
                          {:select (select-options table)
                           :from [table]
                           :inner-join [[:remote_sync_object :rs_obj]
                                        [:and
                                         [:= :rs_obj.model_id id-col]
                                         [:= :rs_obj.model_type [:inline entity-type]]]]
                           :where [:not= :status "synced"]}))
                      synced-models)]
    {:union-all queries}))

(defn dirty-global?
  "A boolean value reporting if any collection has changes since the last sync

  Returns:
    boolean if the collection has changes or not"
  []
  (t2/exists? :model/RemoteSyncObject :status [:not= "synced"]))

(defn dirty-for-global
  "All models for any collection that are dirty along with a note about why their state is dirty

  Returns:
    seq of models that have changed since the last remote sync"
  []
  (t2/query (dirty items-select)))

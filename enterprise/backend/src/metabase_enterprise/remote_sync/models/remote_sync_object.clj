(ns metabase-enterprise.remote-sync.models.remote-sync-object
  "Model and queries for tracking remote-synced objects and their dirty state.

   ## Adding a New Model to Dirty-State Tracking

   To add a new model to the dirty-state queries (so it appears in the UI
   when checking for unsynchronized changes), add an entry to [[synced-model-configs]]:

   ```clojure
   :your_table_name {:model-type \"YourModel\"    ; String stored in RemoteSyncObject.model_type
                     :model-label \"yourmodel\"}  ; String returned in API results
   ```

   ### Required Configuration Keys

   - `:model-type` - String used in RemoteSyncObject.model_type column (e.g. \"Card\", \"Dashboard\")
   - `:model-label` - String label returned in query results (e.g. \"card\", \"dashboard\")

   ### Optional Configuration Keys

   - `:has-description` (default true) - Set to false if model lacks a description column
   - `:has-authority-level` (default false) - Set to true if model has authority_level column
   - `:has-updated-at` (default true) - Set to false if model lacks updated_at column
   - `:extra-columns` - Vector of extra columns to include, e.g. `[:display :query_type]`
   - `:table-join` - If model gets collection_id through another table, specify that table keyword
   - `:collection-id-source` - How to get collection_id:
     - `:direct` (default) - Model has its own collection_id column
     - `:self` - Use the model's id as collection_id (for Collection model itself)
     - `:via-table` - Join through `:table-join` table to get collection_id

   ### Example: Model with Direct collection_id

   Most models have a direct collection_id column:

   ```clojure
   :action {:model-type \"Action\"
            :model-label \"action\"}
   ```

   ### Example: Model Needing Table Join

   Some models (like Field, Segment) relate to collections through their parent table:

   ```clojure
   :dimension {:model-type \"Dimension\"
               :model-label \"dimension\"
               :table-join :metabase_field
               :collection-id-source :via-table}
   ```"
  (:require
   [clojure.set :as set]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/RemoteSyncObject [_model] :remote_sync_object)

(derive :model/RemoteSyncObject :metabase/model)

;;; ------------------------------------------------ Model Configuration ------------------------------------------------

(def ^:private synced-model-configs
  "Configuration for models tracked in remote-sync dirty state.
   See namespace docstring for full documentation on adding new models."
  {:collection           {:model-type           "Collection"
                          :model-label          "collection"
                          :has-authority-level  true
                          :has-description      false
                          :has-updated-at       false
                          :collection-id-source :self}
   :report_card          {:model-type    "Card"
                          :model-label   "card"
                          :extra-columns [:display :query_type]}
   :document             {:model-type      "Document"
                          :model-label     "document"
                          :has-description false}
   :report_dashboard     {:model-type  "Dashboard"
                          :model-label "dashboard"}
   :native_query_snippet {:model-type      "NativeQuerySnippet"
                          :model-label     "snippet"
                          :has-description false}
   :timeline             {:model-type  "Timeline"
                          :model-label "timeline"}
   :metabase_table       {:model-type  "Table"
                          :model-label "table"}
   :metabase_field       {:model-type           "Field"
                          :model-label          "field"
                          :table-join           :metabase_table
                          :extra-columns        [:table_id :table_name]
                          :collection-id-source :via-table}
   :segment              {:model-type           "Segment"
                          :model-label          "segment"
                          :extra-columns        [:table_id :table_name]
                          :table-join           :metabase_table
                          :collection-id-source :via-table}})

;;; -------------------------------------------- Select Clause Generation ----------------------------------------------

(defn- build-select-clause
  "Build HoneySQL select clause for a model based on its config.
   Generates the standard set of columns needed for dirty-state queries."
  [table-key {:keys [model-label has-description has-authority-level has-updated-at
                     collection-id-source table-join extra-columns]
              :or   {has-description      true
                     has-authority-level  false
                     has-updated-at       true
                     collection-id-source :direct
                     extra-columns        []}}]
  (let [tbl (name table-key)
        col #(keyword (str tbl "." (name %)))
        extra-set (set extra-columns)]
    (vec
     (concat
      ;; Standard columns all models have
      [(col :id)
       (col :name)
       (col :created_at)]
      ;; Authority level (only Collection has this)
      [(if has-authority-level (col :authority_level) [nil :authority_level])]
      ;; Collection ID - varies by source
      [(case collection-id-source
         :self     [(col :id) :collection_id]
         :direct   (col :collection_id)
         :via-table [:metabase_table.collection_id :collection_id])]
      ;; Extra columns (display, query_type) - nil if not present
      [(if (extra-set :display) (col :display) [nil :display])]
      [(if (extra-set :query_type) (col :query_type) [nil :query_type])]
      [(if (extra-set :table_id) (col :table_id) [[:cast nil :int] :table_id])]
      [(if (extra-set :table_name) [:metabase_table.name :table_name] [nil :table_name])]
      ;; Description
      [(if has-description (col :description) [nil :description])]
      ;; Updated at, model label, and sync status
      [(if has-updated-at (col :updated_at) [nil :updated_at])
       [[:inline model-label] :model]
       [:rs_obj.status :sync_status]]))))

;;; --------------------------------------------- Derived Configuration ------------------------------------------------

(def ^:private synced-models
  "Map of table keyword to model type string.
   Derived from [[synced-model-configs]]."
  (into {} (map (fn [[k v]] [k (:model-type v)]) synced-model-configs)))

(def ^:private items-select
  "Map of table keyword to HoneySQL select clause.
   Derived from [[synced-model-configs]]."
  (into {} (map (fn [[k v]] [k (build-select-clause k v)]) synced-model-configs)))

(def ^:private models-requiring-table-join
  "Set of table keywords that need to join through metabase_table to get collection_id.
   Derived from [[synced-model-configs]]."
  (set (keep (fn [[k v]] (when (:table-join v) k)) synced-model-configs)))

;;; ------------------------------------------------ Query Building ----------------------------------------------------

(defn- build-dirty-union-all
  "Builds a HoneySQL UNION ALL query that returns all dirty objects across all synced model types.
   Each model gets a SELECT that joins with remote_sync_object and filters for non-synced status."
  [select-options]
  (let [queries (mapv (fn [[table entity-type]]
                        (let [id-col    (keyword (str (name table) ".id"))
                              base-join [[:remote_sync_object :rs_obj]
                                         [:and
                                          [:= :rs_obj.model_id id-col]
                                          [:= :rs_obj.model_type [:inline entity-type]]]]
                              ;; Add table join for models that need it (Field, Segment)
                              full-join (if (models-requiring-table-join table)
                                          (into base-join
                                                [[:metabase_table :metabase_table]
                                                 [:= (keyword (str (name table) ".table_id")) :metabase_table.id]])
                                          base-join)]
                          {:select     (select-options table)
                           :from       [table]
                           :inner-join full-join
                           :where      [:not= :status "synced"]}))
                      synced-models)]
    {:union-all queries}))

;;; ------------------------------------------------- Public API -------------------------------------------------------


(defn dirty-global?
  "Checks if any collection has changes since the last sync.
   Returns true if any remote-synced object has a status other than 'synced', false otherwise."
  []
  (t2/exists? :model/RemoteSyncObject :status [:not= "synced"]))

(defn dirty-for-global
  "Gets all models in any collection that are dirty with their sync status.
   Returns a sequence of model maps that have changed since the last remote sync,
   including details about their current state and sync status."
  []
  (->> (t2/select :model/RemoteSyncObject :status [:not= "synced"])
       (map #(-> %
                 (dissoc :id)
                 (set/rename-keys {:model_id :id
                                   :model_name :name
                                   :model_type :model
                                   :model_collection_id :collection_id
                                   :model_display :display
                                   :status :sync_status})))
       (into [])))

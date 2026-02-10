(ns metabase-enterprise.workspaces.execute
  "This namespace is concerned with executing non-AppDB transforms, with optional reference re-mappings.

  It currently lives inside the workspace module, but eventually will become part of the transform module, so it should
  not make any assumptions about being run within a workspace, having the input / output semantics of a workspace, and
  especially it should not touch any of the Workspace entities inside AppDb, or any of the other workspace namespaces.

  For now, it uses AppDB as a side-channel with the transforms module, but in future this module should be COMPLETELY
  decoupled from AppDb."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.transforms-python.python-runner :as python-runner]
   [metabase.api.common :as api]
   [metabase.query-processor :as qp]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.transforms.core :as transforms]
   [metabase.transforms.execute :as transforms.execute]
   [metabase.transforms.util :as transforms.util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- execution-results
  "Extract execution metadata from transform_run and target table info.
   Must be called within the transaction before rollback."
  [{xf-id :id :keys [target]}]
  (let [run (t2/select-one :model/TransformRun :transform_id xf-id)]
    (merge
     (select-keys run [:status :start_time :end_time :message])
     {:table {:name   (:name target)
              :schema (:schema target)}})))

(defn- remap-python-source
  "Remap source-tables in a Python transform source to point to isolated tables.
   Handles both legacy integer format and new map format (from PR #66934)."
  [table-mapping source]
  (letfn [(remap [{:keys [database_id schema table table_id] :as table-ref}]
            (if-let [{:keys [id db-id schema table]} (or (table-mapping table-ref)
                                                         (some-> table_id table-mapping)
                                                         (when table
                                                           (table-mapping [database_id schema table])))]
              ;; Prefer table ID when available; map format won't work until PR #66934 is merged:
              ;; https://github.com/metabase/metabase/pull/66934
              (or id {:database_id db-id, :schema schema, :table table})
              ;; Leave it un-mapped if we don't have an override.
              table-ref))]
    (update source :source-tables update-vals remap)))

(defn- remap-sql-source [table-mapping source]
  (let [remapping (reduce
                   (fn [remapping [[_ source-schema source-table] {target-schema :schema, target-table :table}]]
                     (assoc-in remapping [:tables {:schema source-schema
                                                   :table  source-table}]
                               {:schema target-schema
                                :table  target-table}))
                   {:schemas {}
                    :tables  {}}
                   ;; Strip out the numeric keys (table ids)
                   (filter (comp vector? key) table-mapping))
        database-id (get-in source [:query :database])
        driver      (some->> database-id (t2/select-one :model/Database) :engine)]
    (update-in source [:query :stages 0 :native]
               #(sql-tools/replace-names driver % remapping {:allow-unused? true}))))

(defn- remap-mbql-source [_table-mapping _field-map source]
  (throw (ex-info "Remapping MBQL queries is not supported yet" {:source source})))

(defn- remap-source [table-map field-map source-type source]
  (case source-type
    :mbql (remap-mbql-source table-map field-map source)
    ;; TODO (Chris 2025-12-12) -- make sure it's actually a SQL dialect though..
    :native (remap-sql-source table-map source)
    :python (remap-python-source table-map source)))

;; You might prefer a multi-method? I certainly would.

(defn- remap-target [table-map target-fallback {d :database, s :schema, t :name :as target}]
  (if-let [replacement (or (table-map [d s t]) (target-fallback [d s t]))]
    ;; Always fallback to tables for re-mapped outputs, regardless of the type used in the original target.
    {:type     (:type replacement "table")
     :database (:db-id replacement)
     :schema   (:schema replacement)
     :name     (:table replacement)}
    target))

(def ^:private no-mapping {})

(defn remapped-target
  "Extracts and applies remapping to a transform's target table reference.

   Used when needing to determine the isolated table location without running the full transform.
   Useful for error reporting and result construction.

   `remapping` is a map with:
   - `:tables`          - map of table references to isolated table specs
   - `:target-fallback` - function to generate fallback mappings for unmapped targets

   Returns the remapped target as a map with `:type`, `:database`, `:schema`, and `:name`."
  [{:keys [target] :as _transform} remapping]
  (let [table-mapping   (:tables remapping no-mapping)
        target-fallback (:target-fallback remapping no-mapping)]
    (remap-target table-mapping target-fallback target)))

(def ^:private preview-row-limit
  "Maximum number of rows to return in dry-run/preview mode."
  2000)

(defn- dry-run-python
  "Run Python transform and return first 2000 rows without persisting.
   Returns a map with :status and :data (on success) or :message (on failure)."
  [{:keys [source]} remapping]
  (let [table-mapping          (:tables remapping no-mapping)
        remapped-source        (remap-python-source table-mapping source)
        resolved-source-tables (transforms.util/resolve-source-tables (:source-tables remapped-source))
        {:as   result
         :keys [cols rows]}    (python-runner/execute-and-read-output!
                                {:code          (:body remapped-source)
                                 :source-tables resolved-source-tables
                                 :row-limit     preview-row-limit})
        flatrows               (apply juxt (map (fn [c] (let [cname (:name c)] #(get % cname))) cols))]
    (if (= :succeeded (:status result))
      {:status :succeeded
       ;; return logs for debugging
       :logs   (str/join "\n" (:logs result))
       :data   {:cols cols
                :rows (mapv flatrows rows)}}
      {:status  :failed
       :message (:message result)})))

(defn- run-query
  "Remap source, execute query, and format as ::ws.t/query-result.
   Options: :row-limit (default 2000), :error-context (for logging).
   Returns {:status :succeeded :data {...} :running_time ...} or {:status :failed :message ...}."
  [source source-type remapping {:keys [row-limit error-context]
                                 :or   {row-limit preview-row-limit}}]
  (try
    (let [table-mapping   (:tables remapping no-mapping)
          field-mapping   (:fields remapping no-mapping)
          remapped-source (remap-source table-mapping field-mapping source-type source)
          query           (-> (:query remapped-source)
                              (qp/userland-query)
                              (assoc :constraints {:max-results           row-limit
                                                   :max-results-bare-rows row-limit}))
          result          (qp/process-query query)
          data            (:data result)]
      (if (= :completed (:status result))
        {:status       :succeeded
         :data         (select-keys data [:rows :cols :results_metadata])
         :running_time (:running_time result)
         :started_at   (:started_at result)}
        {:status  :failed
         :message (or (:error result) "Query execution failed")}))
    (catch Exception e
      (log/error e error-context)
      {:status  :failed
       :message (ex-message e)})))

(defn- dry-run-sql
  "Run SQL transform query and return first 2000 rows without persisting.
   Returns a ::ws.t/query-result map with data nested under :data to match /api/dataset format."
  [{:keys [source]} remapping]
  (run-query source (transforms/transform-source-type source) remapping
             {:error-context "Failed to run sql dry-run"}))

(defn execute-adhoc-sql
  "Execute an arbitrary SQL query against a database and return up to row-limit rows (default 2000).
   Applies workspace table remapping so queries can reference global table names.
   Returns a ::ws.t/query-result map with data nested under :data."
  ([database-id sql remapping]
   (execute-adhoc-sql database-id sql remapping {}))
  ([database-id sql remapping opts]
   (let [source {:query {:database database-id
                         :lib/type :mbql/query
                         :stages   [{:lib/type :mbql.stage/native
                                     :native   sql}]}}]
     (run-query source :native remapping
                (merge {:error-context "Failed to execute adhoc SQL query"} opts)))))

(defn run-transform-preview
  "Execute transform and return first 2000 rows without persisting.
   Returns a ::ws.t/query-result map with data nested under :data."
  [{:keys [source] :as transform} remapping]
  (let [s-type (transforms/transform-source-type source)]
    (case s-type
      (:native :mbql) (dry-run-sql transform remapping)
      :python         (dry-run-python transform remapping))))

(defn run-transform-with-remapping
  "Execute a given collection with the given table and field re-mappings.

   This is used by Workspaces to re-route the output of each transform to a non-production table, and
   to re-write their queries where these outputs transitively become inputs to other transforms.

   Returns an ::ws.t/execution-result map with status, timing, and table metadata.

   -------

   NOTE: currently execution is done using transaction-rollback pattern, as a short-term hack.

   1. Creating temporary Transform/TransformRun records in a transaction
   2. Executing using existing transform infrastructure
   3. Scraping metadata (execution stats + table schema)
   4. Rolling back the transaction (no app DB records persist)

   The warehouse DB changes (actual table data) DO persist in the isolated schema."
  [{:keys [source target] :as transform} remapping]
  (t2/with-transaction [_conn]
    (let [s-type          (transforms/transform-source-type source)
          table-mapping   (:tables remapping no-mapping)
          target-fallback (:target-fallback remapping no-mapping)
          field-mapping   (:fields remapping no-mapping)
          new-xf          (-> (select-keys transform [:name :description])
                              (assoc :creator_id api/*current-user-id*
                                     :source (remap-source table-mapping field-mapping s-type source)
                                     :target (remap-target table-mapping target-fallback target)))
          _               (assert (:target new-xf) "Target mapping must not be nil")
          temp-xf         (t2/insert-returning-instance! :model/Transform new-xf)]
      (try
        (transforms.execute/execute! temp-xf {:run-method :manual})
        (catch Exception _e
          ;; Execution failed - the TransformRun record has been updated with failure status and message
          nil))
      ;; Return execution results whether succeeded or failed
      (u/prog1 (execution-results temp-xf)
        (t2/delete! :model/Transform (:id temp-xf))))))

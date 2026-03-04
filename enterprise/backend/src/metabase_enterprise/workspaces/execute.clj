(ns metabase-enterprise.workspaces.execute
  "Executing transforms with optional reference re-mappings, without writing to AppDB.

  Uses transforms-base.core/execute! to run transforms in-memory. No Transform or TransformRun
  rows are created in AppDB. Warehouse DB changes (actual table data) persist in the isolated schema."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.transforms-python.python-runner :as python-runner]
   [metabase.query-processor :as qp]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.transforms-base.core :as transforms-base]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mu/defn- remap-python-source
  "Remap source-tables in a Python transform source to point to isolated tables."
  [table-mapping source :- [:map [:source-tables [:sequential ::transforms.schema/source-table-entry]]]]
  (letfn [(remap [{:keys [database_id schema table table_id] :as entry}]
            (if-let [{:keys [id db-id] target-schema :schema target-table :table}
                     (or (table-mapping entry)
                         (some-> table_id table-mapping)
                         (when table
                           (table-mapping [database_id schema table])))]
              (cond-> entry
                id            (assoc :table_id id)
                db-id         (assoc :database_id db-id)
                target-schema (assoc :schema target-schema)
                target-table  (assoc :table target-table))
              entry))]
    (update source :source-tables (fn [entries] (mapv remap entries)))))

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
        driver      (some->> database-id (t2/select-one-fn :engine :model/Database))]
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
        resolved-source-tables (transforms-base.u/resolve-source-tables (:source-tables remapped-source))
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
  (run-query source (transforms-base.u/transform-source-type source) remapping
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
  (let [s-type (transforms-base.u/transform-source-type source)]
    (case s-type
      (:native :mbql) (dry-run-sql transform remapping)
      :python         (dry-run-python transform remapping))))

(defn run-transform-with-remapping
  "Execute a given transform with the given table and field re-mappings.

   This is used by Workspaces to re-route the output of each transform to a non-production table, and
   to re-write their queries where these outputs transitively become inputs to other transforms.

   Returns an ::ws.t/execution-result map with status, timing, and table metadata.

   Uses transforms-base.core/execute! to run the transform in-memory without writing
   Transform or TransformRun rows to AppDB. The warehouse DB changes (actual table data)
   DO persist in the isolated schema."
  [{:keys [source target] :as transform} remapping]
  (let [s-type          (transforms-base.u/transform-source-type source)
        table-mapping   (:tables remapping no-mapping)
        target-fallback (:target-fallback remapping no-mapping)
        field-mapping   (:fields remapping no-mapping)
        remapped-xf     (-> (select-keys transform [:name :description])
                            (assoc :source (remap-source table-mapping field-mapping s-type source)
                                   :target (remap-target table-mapping target-fallback target)))
        _               (assert (:target remapped-xf) "Target mapping must not be nil")
        start-time      (java.time.Instant/now)
        result          (transforms-base/execute! remapped-xf {:publish-events? false})]
    {:status     (:status result)
     :start_time start-time
     :end_time   (java.time.Instant/now)
     :message    (or (:logs result) (some-> (:error result) ex-message))
     :table      (select-keys (:target remapped-xf) [:name :schema])}))

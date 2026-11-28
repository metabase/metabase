(ns metabase-enterprise.transforms-inspector.query-analysis
  "Query analysis for Transform Inspector.

   Extracts structural information from MBQL and native SQL queries:
   - Join structure (strategy, alias, source table, conditions)
   - Visited fields (fields used in WHERE, JOIN, GROUP BY, ORDER BY)

   For native queries whose joins can be counted, each join comes with the SQL of its step query, which
   [[metabase.sql-tools.core/join-steps]] generates, so no parser structure leaves sql-tools."
  (:require
   [metabase-enterprise.transforms-inspector.db :as transforms-inspector.db]
   [metabase.driver.sql.normalize :as sql.normalize]
   [metabase.lib.core :as lib]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- MBQL Analysis --------------------------------------------------

(defn- extract-mbql-join-structure
  "Extract join structure from preprocessed MBQL query."
  [preprocessed-query]
  (when-let [joins (lib/joins preprocessed-query 0)]
    (mapv (fn [join]
            {:strategy     (or (:strategy join) :left-join)
             :alias        (:alias join)
             :source-table (-> join :stages first :source-table)
             :conditions   (:conditions join)})
          joins)))

(defn- extract-mbql-visited-fields
  "Extract field IDs from semantically important MBQL clauses."
  [query]
  (let [extract-ids (fn [clauses] (into #{} (mapcat lib/all-field-ids) clauses))
        filter-fields   (some-> (lib/filters query 0) extract-ids)
        group-by-fields (some-> (lib/breakouts query 0) extract-ids)
        order-by-fields (some-> (lib/order-bys query 0) extract-ids)
        join-fields     (some->> (lib/joins query 0)
                                 (into #{} (mapcat #(mapcat lib/all-field-ids (:conditions %)))))]
    {:all (into #{} cat [join-fields filter-fields group-by-fields order-by-fields])}))

(defn analyze-mbql-query
  "Analyze an MBQL query for join structure and visited fields.
   Returns {:join-structure [...] :visited-fields {...}} or nil on failure."
  [transform]
  (let [preprocessed (-> transform :source :query
                         transforms-base.u/massage-sql-query
                         qp.preprocess/preprocess)]
    (when (<= (count (:stages preprocessed)) 1)
      {:preprocessed-query preprocessed
       :from-table-id      (lib/primary-source-table-id preprocessed)
       :join-structure     (extract-mbql-join-structure preprocessed)
       :visited-fields     (extract-mbql-visited-fields preprocessed)})))

;;; -------------------------------------------------- Native SQL Analysis --------------------------------------------------

(defn- resolve-native-visited-fields
  "Resolve native SQL column references to Metabase field IDs using sql-tools.
   Returns a visited-fields map with all referenced field IDs in :all.
   Per-clause breakdown (filter/group-by/order-by/join) is not available through
   sql-tools, but is currently unused by consumers."
  [driver-kw native-query]
  (let [referenced (sql-tools/referenced-fields driver-kw native-query)
        all-ids (into #{} (keep :id) referenced)]
    {:all all-ids}))

(defn- sources->table-id-lookup
  "A map from the normalized name of each table in `sources` to its id."
  [driver sources]
  (u/for-map [{:keys [table_name table_id]} sources]
    [(sql.normalize/normalize-name driver table_name) table_id]))

(defn- native-join-structure
  "The join structure of `native-query`, each join with its step query as `:step-sql`, from [[sql-tools/join-steps]].
  Tables resolve by name among `sources`.
  Returns nil when the query's sources cannot be read.
  When its joins cannot be counted, `:from-count-sql` and every `:step-sql` are nil.
  A join against a CTE or a derived table has a nil `:source-table`."
  [driver native-query sources]
  (let [{:keys [unsupported from steps]} (sql-tools/join-steps driver native-query)
        table->id                        (sources->table-id-lookup driver sources)]
    (when unsupported
      (log/debugf "No join analysis for native query: %s" (name unsupported)))
    (when from
      {:from-table-id  (some-> (:table from) table->id)
       :from-count-sql (:sql from)
       :join-structure (mapv (fn [{:keys [strategy alias table sql]}]
                               {:strategy     strategy
                                :alias        alias
                                :source-table (some-> table table->id)
                                :step-sql     sql})
                             steps)})))

(defn- log-failure
  "Log that `what` failed for a native query, naming only the exception's class."
  [what e]
  ;; A parse error's message quotes the SQL, which must stay out of the logs.
  (log/warnf "Failed to %s for native SQL query: %s" what (.getName (class e))))

(defn analyze-native-query
  "Analyze a native SQL query for join structure and visited fields.
   The join structure carries the step queries from [[sql-tools/join-steps]], when its joins can be counted.
   The visited fields come from [[sql-tools/referenced-fields]].
   Either may be missing when its analysis fails, and the other is still returned.
   `sources` are the transform's source tables, which the joins' tables resolve against."
  [transform sources]
  (try
    (let [native-query (-> (get-in transform [:source :query])
                           transforms-base.u/massage-sql-query
                           qp.preprocess/preprocess)
          db-id        (transforms-base.u/transform-source-database transform)
          driver       (keyword (transforms-inspector.db/database-engine db-id))
          joins        (try
                         (native-join-structure driver native-query sources)
                         (catch Exception e
                           (log-failure "analyze joins" e)
                           nil))
          visited      (try
                         (resolve-native-visited-fields driver native-query)
                         (catch Exception e
                           (log-failure "resolve visited fields" e)
                           nil))]
      (merge {:driver driver, :visited-fields visited} joins))
    (catch Exception e
      (log-failure "analyze" e)
      nil)))

;;; -------------------------------------------------- Unified Analysis --------------------------------------------------

(defn analyze-query
  "Analyze a transform's query for join structure and visited fields.
   Dispatches to MBQL or native analysis based on source type.

   Arguments:
   - transform: the transform map
   - source-type: :mbql, :native, or :python
   - sources: source table info, which a native query's joins resolve against

   Returns:
   {:preprocessed-query <MBQL 5> (MBQL only)
    :driver <keyword> (native only)
    :from-table-id <int> (native only)
    :from-count-sql <sql> (native only)
    :join-structure [{:strategy :alias :source-table
                      :conditions (MBQL) or :step-sql (native)} ...]
    :visited-fields {:all <set of field IDs>}}"
  [transform source-type sources]
  (case source-type
    :mbql   (analyze-mbql-query transform)
    :native (analyze-native-query transform sources)
    nil))

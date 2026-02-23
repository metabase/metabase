(ns metabase-enterprise.dependencies.native-validation
  (:require
   [metabase.driver :as driver]
   [metabase.driver.sql :as driver.sql]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.util.malli :as mu]))

(mu/defn- compile-query :- ::lib.schema/native-only-query
  "Compile a query to native SQL with inline parameters (no JDBC placeholders).

  Uses compile-with-inline-parameters to produce valid SQL that SQLGlot can parse,
  rather than parameterized SQL with ? placeholders.

  Important: We don't preprocess before calling compile-with-inline-parameters because
  parameter substitution must happen INSIDE the *compile-with-inline-parameters* binding
  to produce inline literals instead of ? placeholders."
  [query :- ::lib.schema/query]
  (let [with-params (lib/add-parameters-for-template-tags query)
        compiled    (qp.compile/compile-with-inline-parameters with-params)]
    (lib/native-query with-params (:query compiled))))

(defn- has-card-template-tags?
  "Returns true if the query has any card-type template tags."
  [query]
  (some #(= (:type %) :card) (lib/all-template-tags query)))

(defn- table-deps
  "Returns the set of table IDs referenced directly in the compiled native query."
  [driver compiled]
  (into #{}
        (keep :table)
        (driver/native-query-deps driver compiled)))

(defn- normalize-error
  "Normalize error :name using driver-specific case conventions."
  [driver error]
  (if-let [error-name (:name error)]
    (assoc error :name (driver.sql/normalize-name driver error-name))
    error))

(defn- extract-source-table
  "Extract the single source table from a :single-column col-spec's source-columns.
   Returns:
   - A table spec map like {:table \"products\" :schema \"PUBLIC\"} if exactly one :all-columns source
   - :multiple if there are multiple :all-columns sources (ambiguous)
   - nil otherwise (subquery, no sources, or not a :single-column spec)"
  [col-spec]
  (when (= (:type col-spec) :single-column)
    (let [first-sources   (first (:source-columns col-spec))
          all-col-sources (filter #(= (:type %) :all-columns) first-sources)]
      (case (count all-col-sources)
        0 nil
        1 (:table (first all-col-sources))
        ;; default: multiple all-columns sources
        :multiple))))

(defn- resolve-table-id
  "Map a SQL table spec {:table name, :schema schema} to a Metabase table ID.
   Returns table ID or nil if not found."
  [driver mp table-spec]
  (:table (sql-tools/find-table-or-transform
           driver
           (lib.metadata/tables mp)
           (lib.metadata/transforms mp)
           table-spec)))

(defn- enrich-error
  "Enrich a :missing-column error with source entity information from its col-spec.
   For other error types, returns the error unchanged."
  [driver mp col-spec error]
  (if (not= (:type error) :missing-column)
    error
    (let [source (extract-source-table col-spec)]
      (cond
        (map? source)
        (if-let [table-id (resolve-table-id driver mp source)]
          (assoc error :source-entity-type :table :source-entity-id table-id)
          error)

        (= source :multiple)
        (assoc error :source-entity-type :unknown)

        ;; nil — subquery or unknown structure, leave unenriched for fallback
        :else error))))

(defn- validate-with-sources
  "Validate a compiled native query, enriching errors with source entity information
   derived from the col-spec's source-columns."
  [driver compiled]
  (let [sql                                (lib/raw-native-query compiled)
        mp                                 (lib/->metadata-provider compiled)
        {:keys [used-fields returned-fields errors]} (sql-tools/field-references driver sql)
        check-fields (fn [fields]
                       (mapcat (fn [col-spec]
                                 (->> (sql-tools/resolve-field driver mp col-spec)
                                      (keep :error)
                                      (map (partial enrich-error driver mp col-spec))))
                               fields))]
    (->> (concat errors
                 (check-fields used-fields)
                 (check-fields returned-fields))
         (map (partial normalize-error driver))
         set)))

(defn- fallback-enrich
  "Second-pass enrichment for errors that validate-with-sources couldn't attribute
   (e.g., subquery sources). Falls back to the table-count approach."
  [driver compiled errors]
  (if (every? :source-entity-type errors)
    errors
    (let [tables (table-deps driver compiled)
          source (cond
                   (empty? tables) nil
                   (= 1 (count tables)) {:source-entity-type :table
                                         :source-entity-id   (first tables)}
                   :else {:source-entity-type :unknown})]
      (if source
        (into #{} (map (fn [error]
                         (if (:source-entity-type error)
                           error
                           (merge error source))))
              errors)
        errors))))

(mu/defn validate-native-query
  "Compiles a (native) query and validates that the fields and tables it refers to really exist.

   Returns a set of errors, each enriched with source entity information when possible."
  [driver :- :keyword
   query  :- ::lib.schema/query]
  (let [compiled (compile-query query)]
    (if (has-card-template-tags? query)
      ;; Card ref queries — return raw errors without source attribution (deferred)
      (driver/validate-native-query-fields driver compiled)
      (let [errors (validate-with-sources driver compiled)]
        (if (empty? errors)
          errors
          (fallback-enrich driver compiled errors))))))

(mu/defn native-result-metadata
  "Compiles a (native) query and calculates its result metadata"
  [driver :- :keyword
   query  :- ::lib.schema/query]
  (->> query
       compile-query
       (driver/native-result-metadata driver)))

(mu/defn native-query-deps :- [:set
                               [:or
                                ::driver/native-query-deps.table-dep
                                ::driver/native-query-deps.transform-dep
                                [:map {:closed true} [:snippet ::lib.schema.id/snippet]]
                                [:map {:closed true} [:card ::lib.schema.id/card]]]]
  "Returns the upstream dependencies of a native query, as a set of `{:kind id}` pairs."
  [driver :- :keyword
   query  :- ::lib.schema/native-only-query]
  (let [compiled (compile-query query)]
    (into (driver/native-query-deps driver compiled)
          ;; TODO (Cam 10/1/25) -- Even this much MBQL manipulation outside of Lib is illegal. Move this sort of stuff
          ;; into Lib.
          (keep #(case (:type %)
                   :snippet {:snippet (:snippet-id %)}
                   :card    {:card (:card-id %)}
                   nil))
          (lib/all-template-tags query))))

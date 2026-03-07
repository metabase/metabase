(ns metabase.agent.sci
  "SCI-based Clojure evaluator for agent MBQL query construction.
   Registers metabase.lib functions in a flat SCI namespace and provides
   helper functions (table, field) for metadata resolution by name."
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.js.metadata :as js.metadata]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.util :as u]
   [sci.core :as sci]))

;; Ensure all defmethod registrations are loaded
(comment lib/keep-me)

;;; ------------------------------------------------ SCI Bindings ------------------------------------------------

(def ^:private lib-bindings
  "Core metabase.lib functions exposed to SCI.
   These are registered in the default namespace so agents write (query ...) not (lib/query ...)."
  {;; Query lifecycle
   '->legacy-MBQL lib/->legacy-MBQL

   ;; Filtering
   'filter        lib/filter
   '=             lib/=
   '!=            lib/!=
   '<             lib/<
   '<=            lib/<=
   '>             lib/>
   '>=            lib/>=
   'between       lib/between
   'contains      lib/contains
   'does-not-contain lib/does-not-contain
   'starts-with   lib/starts-with
   'ends-with     lib/ends-with
   'is-null       lib/is-null
   'not-null      lib/not-null
   'is-empty      lib/is-empty
   'not-empty     lib/not-empty
   'and           lib/and
   'or            lib/or
   'not           lib/not
   'time-interval lib/time-interval
   'in            lib/in
   'not-in        lib/not-in

   ;; Aggregation
   'aggregate     lib/aggregate
   'count         lib/count
   'sum           lib/sum
   'avg           lib/avg
   'min           lib/min
   'max           lib/max
   'distinct      lib/distinct
   'median        lib/median
   'stddev        lib/stddev
   'var           lib/var
   'count-where   lib/count-where
   'sum-where     lib/sum-where
   'distinct-where lib/distinct-where
   'share         lib/share
   'percentile    lib/percentile
   'cum-count     lib/cum-count
   'cum-sum       lib/cum-sum

   ;; Breakout / grouping
   'breakout      lib/breakout
   'with-temporal-bucket lib/with-temporal-bucket

   ;; Limit (order-by is in make-context-bindings with enhanced aggregation support)
   'limit         lib/limit

   ;; Expressions
   'expression    lib/expression
   '+             lib/+
   '-             lib/-
   '*             lib/*
   '/             lib//
   'case          lib/case
   'coalesce      lib/coalesce
   'concat        lib/concat
   'substring     lib/substring
   'replace       lib/replace
   'upper         lib/upper
   'lower         lib/lower
   'trim          lib/trim
   'length        lib/length
   'abs           lib/abs
   'ceil          lib/ceil
   'floor         lib/floor
   'round         lib/round
   'power         lib/power
   'sqrt          lib/sqrt
   'log           lib/log
   'exp           lib/exp
   'now           lib/now
   'relative-datetime lib/relative-datetime
   'datetime-add  lib/datetime-add
   'datetime-subtract lib/datetime-subtract
   'get-year      lib/get-year
   'get-month     lib/get-month
   'get-day       lib/get-day
   'get-quarter   lib/get-quarter
   'get-day-of-week lib/get-day-of-week
   'get-hour      lib/get-hour
   'get-minute    lib/get-minute
   'get-second    lib/get-second

   ;; Joins
   'join               lib/join
   'join-clause        lib/join-clause
   'with-join-conditions lib/with-join-conditions
   'with-join-strategy lib/with-join-strategy
   'with-join-fields   lib/with-join-fields
   'with-join-alias    lib/with-join-alias
   'suggested-join-conditions lib/suggested-join-conditions
   'joinable-columns   lib/joinable-columns
   'joins              lib/joins

   ;; Type conversion / temporal extras
   'absolute-datetime  lib/absolute-datetime
   'relative-time-interval lib/relative-time-interval
   'convert-timezone   lib/convert-timezone
   'get-week           lib/get-week

   ;; String extras
   'regex-match-first  lib/regex-match-first
   'ltrim              lib/ltrim
   'rtrim              lib/rtrim

   ;; Advanced
   'offset             lib/offset
   'inside             lib/inside
   'segment            lib/segment

   ;; Binning
   'with-binning       lib/with-binning

   ;; Column introspection
   'visible-columns    lib/visible-columns
   'filterable-columns lib/filterable-columns
   'breakoutable-columns lib/breakoutable-columns
   'aggregable-columns lib/aggregable-columns
   'orderable-columns  lib/orderable-columns
   'expressionable-columns lib/expressionable-columns})

;;; ------------------------------------------------ Helpers ------------------------------------------------

(defn- build-table-lookup
  "Build a map of lowercase table name => table metadata."
  [metadata-provider]
  (into {}
        (map (fn [t] [(u/lower-case-en (:name t)) t]))
        (lib.metadata/tables metadata-provider)))

(defn- build-field-lookup
  "Build a nested map of {lowercase-table-name {lowercase-field-name field-metadata}}."
  [metadata-provider tables-by-name]
  (into {}
        (map (fn [[table-name table-meta]]
               [table-name
                (into {}
                      (map (fn [f] [(u/lower-case-en (:name f)) f]))
                      (lib.metadata/fields metadata-provider (:id table-meta)))]))
        tables-by-name))

(defn- extract-field-ids
  "Extract all numeric field IDs from a nested pMBQL clause.
   Walks the structure looking for [:field opts id] patterns."
  [x]
  (cond
    (and (vector? x) (>= (count x) 3) (= :field (first x)) (number? (nth x 2)))
    #{(nth x 2)}

    (sequential? x)
    (into #{} (mapcat extract-field-ids) x)

    :else #{}))

(defn- agg-signature
  "Return [operator-keyword field-ids-set] for structural comparison of aggregation clauses.
   E.g. [:sum {} [:field {} 2649]] => [:sum #{2649}]"
  [clause]
  [(first clause) (extract-field-ids clause)])

(defn- resolve-orderable
  "Resolve an orderable reference for use with lib/order-by.
   - Field metadata maps: passed through unchanged.
   - Aggregation clauses (vectors like [:sum ...]): matched to orderable-columns
     by operator name and inner field references.
   - Anything else: passed through to lib/order-by."
  [query orderable]
  (cond
    ;; Field metadata map — pass through
    (map? orderable)
    orderable

    ;; Aggregation clause like [:sum {} [:field ...]]
    (and (vector? orderable) (keyword? (first orderable)))
    (let [cols     (lib/orderable-columns query)
          agg-cols (filterv #(= (:lib/source %) :source/aggregations) cols)]
      (cond
        ;; Single aggregation — use it directly
        (= 1 (count agg-cols))
        (first agg-cols)

        ;; Multiple — match by operator name, then disambiguate by field structure
        :else
        (let [op-name      (name (first orderable))
              name-matches (filterv #(clojure.string/starts-with? (or (:name %) "") op-name) agg-cols)]
          (cond
            (= 1 (count name-matches))
            (first name-matches)

            ;; Multiple matches by name — disambiguate using field IDs
            (> (count name-matches) 1)
            (let [target-sig   (agg-signature orderable)
                  query-aggs   (lib/aggregations query)
                  ;; Map aggregation UUID → structural signature
                  uuid->sig    (into {}
                                     (map (fn [agg]
                                            [(:lib/uuid (second agg)) (agg-signature agg)]))
                                     query-aggs)
                  ;; Find orderable columns whose aggregation structurally matches
                  deep-matches (filterv
                                (fn [col]
                                  (let [col-sig (get uuid->sig (:lib/source-uuid col))]
                                    (= target-sig col-sig)))
                                name-matches)]
              (cond
                (= 1 (count deep-matches))
                (first deep-matches)

                (> (count deep-matches) 1)
                (throw (ex-info (str "Ambiguous: multiple identical '" op-name "' aggregations. "
                                     "Use orderable-columns to pick the specific column.")
                                {:operator op-name
                                 :available (mapv :name agg-cols)}))

                :else
                (throw (ex-info (str "No orderable column matched aggregation '" op-name "' on those fields. "
                                     "Available: " (mapv :name agg-cols))
                                {:operator op-name
                                 :available (mapv :name agg-cols)}))))

            :else
            (throw (ex-info (str "No orderable column found for aggregation '" op-name "'. "
                                 "Available: " (mapv :name agg-cols))
                            {:operator op-name
                             :available (mapv :name agg-cols)}))))))

    ;; Anything else
    :else orderable))

(defn- make-context-bindings
  "Create SCI bindings that close over the metadata provider.
   Provides:
   - (query table-meta)  - create a new MBQL query for a table
   - (table \"ORDERS\") or (table 42) - look up table metadata by name or ID
   - (field \"ORDERS\" \"STATUS\") or (field \"STATUS\") or (field 123) - look up field metadata
   - (order-by query orderable) - enhanced order-by with asc/desc and aggregation support
   - (asc orderable), (desc orderable) - direction wrappers for order-by"
  [metadata-provider tables-by-name fields-by-table]
  {'query (fn [table-metadata]
            (lib/query metadata-provider table-metadata))

   'table (fn [table-identifier]
            (if (number? table-identifier)
              ;; Numeric ID lookup
              (or (lib.metadata/table metadata-provider (int table-identifier))
                  (throw (ex-info (str "Table not found by ID: " table-identifier
                                       ". Available tables: "
                                       (clojure.string/join ", "
                                                            (map (fn [[n t]] (str n " (id:" (:id t) ")"))
                                                                 tables-by-name)))
                                  {:table-id table-identifier
                                   :available (keys tables-by-name)})))
              ;; String name lookup
              (let [normalized (u/lower-case-en table-identifier)]
                (or (get tables-by-name normalized)
                    (throw (ex-info (str "Table not found: " table-identifier
                                         ". Available tables: "
                                         (clojure.string/join ", " (keys tables-by-name)))
                                    {:table-name table-identifier
                                     :available (keys tables-by-name)}))))))

   'field (fn
            ;; Single arity: numeric ID or field name (searched across all tables)
            ([field-name-or-id]
             (if (number? field-name-or-id)
               ;; Numeric ID lookup
               (or (lib.metadata/field metadata-provider (int field-name-or-id))
                   (throw (ex-info (str "Field not found by ID: " field-name-or-id)
                                   {:field-id field-name-or-id})))
               ;; Name lookup across all tables
               (let [fn-lower (u/lower-case-en field-name-or-id)
                     matches  (into []
                                    (keep (fn [[tn field-map]]
                                            (when-let [f (get field-map fn-lower)]
                                              [tn f])))
                                    fields-by-table)]
                 (cond
                   (= 1 (count matches))
                   (second (first matches))

                   (> (count matches) 1)
                   (throw (ex-info (str "Ambiguous field \"" field-name-or-id
                                        "\" exists in tables: "
                                        (clojure.string/join ", " (map first matches))
                                        ". Use (field \"TABLE\" \"FIELD\") to disambiguate.")
                                   {:field-name field-name-or-id
                                    :tables (mapv first matches)}))

                   :else
                   (throw (ex-info (str "Field not found: \"" field-name-or-id
                                        "\". Use (field \"TABLE\" \"FIELD\") with explicit table name.")
                                   {:field-name field-name-or-id}))))))
            ;; Two arity: table name/ID + field name
            ([table-name-or-id field-name]
             (let [tn (if (number? table-name-or-id)
                        ;; Numeric table ID — resolve to name
                        (if-let [table-meta (lib.metadata/table metadata-provider (int table-name-or-id))]
                          (u/lower-case-en (:name table-meta))
                          (throw (ex-info (str "Table not found by ID: " table-name-or-id
                                               ". Available tables: "
                                               (clojure.string/join ", "
                                                                    (map (fn [[n t]] (str n " (id:" (:id t) ")"))
                                                                         tables-by-name)))
                                          {:table-id table-name-or-id
                                           :available (keys tables-by-name)})))
                        ;; String table name
                        (u/lower-case-en table-name-or-id))
                   fn (u/lower-case-en field-name)
                   table-fields (get fields-by-table tn)]
               (or (get table-fields fn)
                   (throw (ex-info (str "Field not found: " (if (number? table-name-or-id)
                                                              (str "(table " table-name-or-id ")")
                                                              table-name-or-id)
                                        "." field-name
                                        (when table-fields
                                          (str ". Available fields: "
                                               (clojure.string/join ", " (keys table-fields)))))
                                   {:table-name tn
                                    :field-name field-name
                                    :available (when table-fields (keys table-fields))}))))))

   ;; Direction wrappers for order-by
   'asc  (fn [orderable] {:__order_direction :asc  :__order_value orderable})
   'desc (fn [orderable] {:__order_direction :desc :__order_value orderable})

   ;; Enhanced order-by: handles direction wrappers, direction-first syntax, and aggregation ordering
   'order-by (fn
               ([query orderable]
                (if (and (map? orderable) (:__order_direction orderable))
                  (lib/order-by query
                                (resolve-orderable query (:__order_value orderable))
                                (:__order_direction orderable))
                  (lib/order-by query (resolve-orderable query orderable))))
               ([query a b]
                (if (#{:asc :desc} a)
                  ;; (order-by query :desc orderable)
                  (lib/order-by query (resolve-orderable query b) a)
                  ;; (order-by query orderable :desc)
                  (lib/order-by query (resolve-orderable query a) b))))})
;;; ------------------------------------------------ Evaluate ------------------------------------------------

(defn- fix-namespaced-values
  "Convert namespaced keywords to strings like \"type/Text\" for JSON output.
   Mirrors the logic in metabase.lib.js."
  [x]
  (cond
    (qualified-keyword? x) (str (namespace x) "/" (name x))
    (map? x)               (update-vals x fix-namespaced-values)
    (sequential? x)        (mapv fix-namespaced-values x)
    :else                  x))

(defn ^:export evaluate
  "Evaluate a Clojure code string in an SCI context with metabase.lib functions available.

   Parameters:
   - code-str:    String of Clojure code to evaluate
   - database-id: Numeric database ID
   - metadata-js: JS object in the format expected by metabase.lib.js.metadata/metadata-provider
                   i.e. {databases: {}, tables: {}, fields: {}, ...}

   Returns: JS object — the legacy MBQL query (inner query, not full dataset_query)"
  [code-str database-id metadata-js]
  (try
    (let [;; Create metadata provider from raw JS metadata
          metadata-provider (js.metadata/metadata-provider database-id metadata-js)
          ;; Build lookup maps for helper functions
          tables-by-name    (build-table-lookup metadata-provider)
          fields-by-table   (build-field-lookup metadata-provider tables-by-name)
          ;; Create SCI context with all bindings
          context-bindings  (make-context-bindings metadata-provider tables-by-name fields-by-table)
          all-bindings      (merge lib-bindings context-bindings)
          sci-ctx           (sci/init {:namespaces {'user all-bindings}
                                       :bindings   all-bindings})
          ;; Evaluate the code
          result            (sci/eval-string* sci-ctx code-str)]
      ;; If result is a pMBQL query, convert to legacy MBQL JSON
      (if (and (map? result) (= (:lib/type result) :mbql/query))
        (-> (lib/->legacy-MBQL result)
            fix-namespaced-values
            (clj->js :keyword-fn u/qualified-name))
        (clj->js result)))
    (catch :default e
      (throw (js/Error. (str "SCI evaluation error: " (ex-message e)))))))

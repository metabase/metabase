(ns metabase-enterprise.dependencies.native-validation
  (:require
   [clojure.string :as str]
   [metabase.driver :as driver]
   [metabase.driver.sql :as driver.sql]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.sql-tools.common :as sql-tools.common]
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

(defn- compile-toplevel-query
  "Compile a query replacing card references with placeholder subqueries.
   Card refs like {{#1}} are replaced with (SELECT NULL AS col1, NULL AS col2, ...)
   based on the referenced card's result-metadata.

   Returns {:compiled <native-only-query>, :card-columns {card-id #{normalized-col-names}}}
   or nil if any referenced card lacks result-metadata."
  [driver query]
  (let [mp        (lib/->metadata-provider query)
        stage     (first (:stages query))
        ttags     (:template-tags stage)
        card-tags (into {} (filter #(= (:type (val %)) :card)) ttags)]
    (when (every? (fn [[_ tag]]
                    (seq (:result-metadata (lib.metadata/card mp (:card-id tag)))))
                  card-tags)
      (let [card-columns
            (into {}
                  (map (fn [[_ tag]]
                         (let [card (lib.metadata/card mp (:card-id tag))
                               cols (into #{}
                                          (map #(driver.sql/normalize-name driver (:name %)))
                                          (:result-metadata card))]
                           [(:card-id tag) cols])))
                  card-tags)

            make-placeholder
            (fn [card-id]
              (let [cols (:result-metadata (lib.metadata/card mp card-id))]
                (str "(SELECT "
                     (->> cols
                          (map #(str "NULL AS " (:name %)))
                          (str/join ", "))
                     ")")))

            modified-sql
            (reduce (fn [sql [tag-name tag]]
                      (str/replace sql
                                   (str "{{" tag-name "}}")
                                   (make-placeholder (:card-id tag))))
                    (:native stage)
                    card-tags)

            non-card-tags
            (into {} (remove #(= (:type (val %)) :card)) ttags)

            modified-query
            (-> query
                (assoc-in [:stages 0 :native] modified-sql)
                (assoc-in [:stages 0 :template-tags] non-card-tags))]
        {:compiled     (compile-query modified-query)
         :card-columns card-columns}))))

(defn- table-deps
  "Returns the set of table dep maps (e.g. {:table \"products\" :schema \"public\"})
   referenced directly in the compiled native query."
  [driver compiled]
  (into #{}
        (filter :table)
        (driver/native-query-deps driver compiled)))

(defn- normalize-error
  "Normalize error :name using driver-specific case conventions."
  [driver error]
  (if-let [error-name (:name error)]
    (assoc error :name (driver.sql/normalize-name driver error-name))
    error))

(defn- extract-source-entity
  "Extract source entity info from a :single-column col-spec's source-columns.
   Returns:
   - {:kind :table, :spec table-spec} for a single table source
   - {:kind :card, :custom-field-aliases #{aliases}} for subquery/card sources
   - :multiple for ambiguous sources (mixed table+card, or multiple tables)
   - nil otherwise (no recognizable sources, or not a :single-column spec)"
  [col-spec]
  (when (= (:type col-spec) :single-column)
    (let [first-sources   (first (:source-columns col-spec))
          all-col-sources (filter #(= (:type %) :all-columns) first-sources)
          custom-sources  (filter #(= (:type %) :custom-field) first-sources)]
      (cond
        ;; Both table and subquery sources → ambiguous
        (and (seq all-col-sources) (seq custom-sources))
        :multiple

        ;; Only table sources
        (seq all-col-sources)
        (if (= 1 (count all-col-sources))
          {:kind :table, :spec (:table (first all-col-sources))}
          :multiple)

        ;; Only subquery/card sources
        (seq custom-sources)
        {:kind :card, :custom-field-aliases (into #{} (map :alias) custom-sources)}

        ;; No recognizable sources
        :else nil))))

(defn- resolve-table-id
  "Map a SQL table spec {:table name, :schema schema} to a Metabase table ID.
   Returns table ID or nil if not found."
  [driver mp table-spec]
  (:table (sql-tools.common/find-table-or-transform
           driver
           (lib.metadata/tables mp)
           (lib.metadata/transforms mp)
           table-spec)))

(defn- match-card-source
  "Match a set of custom-field aliases against the card-columns map.
   Returns card-id if exactly one card's column set contains all the aliases, nil otherwise."
  [driver aliases card-columns]
  (let [normalized (into #{} (map #(driver.sql/normalize-name driver %)) aliases)
        matches    (keep (fn [[card-id col-names]]
                           (when (every? col-names normalized)
                             card-id))
                         card-columns)]
    (when (= 1 (count matches))
      (first matches))))

(defn- enrich-error
  "Enrich a :missing-column error with source entity information from its col-spec.
   For other error types, returns the error unchanged.
   card-columns is a map of {card-id → #{normalized-col-names}} or nil for non-card queries."
  [driver mp card-columns col-spec error]
  (if (not= (:type error) :missing-column)
    error
    (let [source (extract-source-entity col-spec)]
      (cond
        ;; Table source
        (and (map? source) (= (:kind source) :table))
        (if-let [table-id (resolve-table-id driver mp (:spec source))]
          (assoc error :source-entity-type :table :source-entity-id table-id)
          error)

        ;; Card/subquery source
        (and (map? source) (= (:kind source) :card))
        (if card-columns
          (if-let [card-id (match-card-source driver (:custom-field-aliases source) card-columns)]
            (assoc error :source-entity-type :card :source-entity-id card-id)
            (assoc error :source-entity-type :unknown))
          ;; No card-columns → regular subquery, leave unenriched for fallback
          error)

        ;; Multiple/ambiguous sources
        (= source :multiple)
        (assoc error :source-entity-type :unknown)

        ;; nil — unknown structure, leave unenriched for fallback
        :else error))))

(defn- validate-with-sources
  "Validate a compiled native query, enriching errors with source entity information
   derived from the col-spec's source-columns.
   card-columns is a map of {card-id → #{normalized-col-names}} or nil for non-card queries."
  [driver compiled card-columns]
  (let [sql                                (lib/raw-native-query compiled)
        mp                                 (lib/->metadata-provider compiled)
        {:keys [used-fields returned-fields errors]} (sql-tools/field-references driver sql)
        check-fields (fn [fields]
                       (mapcat (fn [col-spec]
                                 (->> (sql-tools.common/resolve-field driver mp col-spec)
                                      (keep :error)
                                      (map (partial enrich-error driver mp card-columns col-spec))))
                               fields))]
    (into #{}
          (map (partial normalize-error driver))
          (concat errors
                  (check-fields used-fields)
                  (check-fields returned-fields)))))

(defn- fallback-enrich
  "Second-pass enrichment for errors that validate-with-sources couldn't attribute
   (e.g., subquery sources). Falls back to the table-count approach."
  [driver compiled errors]
  (if (every? :source-entity-type errors)
    errors
    (let [mp     (lib/->metadata-provider compiled)
          tables (table-deps driver compiled)
          source (cond
                   (empty? tables) nil
                   (= 1 (count tables))
                   (let [table-spec (first tables)]
                     (if-let [table-id (if (int? (:table table-spec))
                                         (:table table-spec)
                                         (resolve-table-id driver mp table-spec))]
                       {:source-entity-type :table
                        :source-entity-id   table-id}
                       {:source-entity-type :unknown}))
                   :else {:source-entity-type :unknown})]
      (if source
        (into #{} (map (fn [error]
                         (if (or (:source-entity-type error)
                                 (not= (:type error) :missing-column))
                           error
                           (merge error source))))
              errors)
        errors))))

(mu/defn validate-native-query
  "Compiles a (native) query and validates that the fields and tables it refers to really exist.

   Returns a set of errors, each enriched with source entity information when possible."
  [driver :- :keyword
   query  :- ::lib.schema/query]
  (if (has-card-template-tags? query)
    (if-let [{:keys [compiled card-columns]} (compile-toplevel-query driver query)]
      (let [errors (validate-with-sources driver compiled card-columns)]
        (if (empty? errors)
          errors
          (fallback-enrich driver compiled errors)))
      ;; Fallback: cards without result-metadata, use full expansion
      (driver/validate-native-query-fields driver (compile-query query)))
    (let [compiled (compile-query query)
          errors   (validate-with-sources driver compiled nil)]
      (if (empty? errors)
        errors
        (fallback-enrich driver compiled errors)))))

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

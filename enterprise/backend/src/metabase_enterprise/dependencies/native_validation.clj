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
   [metabase.sql-tools.core :as sql-tools]
   [metabase.util :as u]
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

(def ^:private card-placeholder-prefix
  "Prefix used to generate placeholder table names for card references.
   Card ref {{#N}} becomes mb__validat_card__N in the SQL sent to SQLGlot."
  "mb__validat_card__")

(defn- parse-card-placeholder
  "If table-name is a card placeholder (e.g. \"mb__VALIDAT_card__42\" or \"MB__VALIDAT_CARD__42\"),
   return the card ID. Returns nil otherwise. Case-insensitive to handle driver normalization."
  [table-name]
  (let [lower (u/lower-case-en (str table-name))]
    (when (str/starts-with? lower card-placeholder-prefix)
      (parse-long (subs lower (count card-placeholder-prefix))))))

(defn- compile-toplevel-query
  "Compile a query replacing card references with placeholder table names.
   Card refs like {{#1}} are replaced with mb__validat_card__1.

   Returns the compiled native-only-query, or nil if the original SQL contains
   the placeholder prefix (collision guard)."
  [query]
  (let [stage     (first (:stages query))
        sql       (:native stage)
        ttags     (:template-tags stage)
        card-tags (into {} (filter #(= (:type (val %)) :card)) ttags)]
    (when-not (str/includes? sql card-placeholder-prefix)
      (let [modified-sql
            (reduce (fn [s [tag-name tag]]
                      (str/replace s
                                   (str "{{" tag-name "}}")
                                   (str card-placeholder-prefix (:card-id tag))))
                    sql
                    card-tags)

            non-card-tags
            (into {} (remove #(= (:type (val %)) :card)) ttags)

            modified-query
            (-> query
                (assoc-in [:stages 0 :native] modified-sql)
                (assoc-in [:stages 0 :template-tags] non-card-tags))]
        (compile-query modified-query)))))

(defn- table-deps
  "Returns the set of table dep maps (e.g. {:table \"products\" :schema \"public\"})
   referenced directly in the compiled native query.
   Excludes card placeholder tables (mb__validat_card__N)."
  [driver compiled]
  (into #{}
        (filter (fn [dep]
                  (and (:table dep)
                       (not (parse-card-placeholder (:table dep))))))
        (driver/native-query-deps driver compiled)))

(defn- extract-source-entity
  "Extract source entity info from a :single-column col-spec's source-columns.
   When card-placeholders? is true, recognizes card placeholder table names (mb__validat_card__N).
   Returns:
   - {:kind :table, :spec table-spec} for a single real table source
   - {:kind :card, :card-id N} for a single card placeholder source (only when card-placeholders?)
   - :multiple for ambiguous sources (multiple sources of any kind)
   - nil otherwise (no recognizable sources, or not a :single-column spec)"
  [card-placeholders? col-spec]
  (let [card-id-fn (if card-placeholders?
                     (fn [source] (some-> source :table :table parse-card-placeholder))
                     (constantly nil))]
    (when (= (:type col-spec) :single-column)
      (let [first-sources   (first (:source-columns col-spec))
            all-col-sources (filter #(= (:type %) :all-columns) first-sources)]
        (cond
          (empty? all-col-sources) nil

          (> (count all-col-sources) 1)
          (let [cards  (keep card-id-fn all-col-sources)
                tables (remove card-id-fn all-col-sources)]
            (cond
              (and (= 1 (count cards)) (empty? tables))
              {:kind :card, :card-id (first cards)}
              (and (empty? cards) (= 1 (count tables)))
              {:kind :table, :spec (:table (first tables))}
              :else :multiple))

          :else
          (let [source   (first all-col-sources)
                card-id  (card-id-fn source)]
            (if card-id
              {:kind :card, :card-id card-id}
              {:kind :table, :spec (:table source)})))))))

(defn- resolve-table-id
  "Map a SQL table spec {:table name, :schema schema} to a Metabase table ID.
   Returns table ID or nil if not found."
  [driver mp table-spec]
  (:table (sql-tools/find-table-or-transform
           driver
           (lib.metadata/tables mp)
           (lib.metadata/transforms mp)
           table-spec)))

(defn- card-column-exists?
  "Check if a column name exists in a card's result-metadata (normalized comparison)."
  [driver mp card-id col-name]
  (when-let [card (lib.metadata/card mp card-id)]
    (let [normalized (driver.sql/normalize-name driver col-name)]
      (some #(= (driver.sql/normalize-name driver (:name %)) normalized)
            (:result-metadata card)))))

(defn- enrich-error
  "Enrich a :missing-column error with source entity information from its col-spec.
   When card-placeholders? is true, checks card placeholder columns against card metadata:
   valid columns return nil (suppressed), invalid ones get source attribution.
   Suppresses :missing-table-alias errors for card placeholder table names.
   For other error types, returns the error unchanged."
  [driver mp card-placeholders? col-spec error]
  (cond
    ;; Suppress missing-table-alias for card placeholders (e.g. SELECT * FROM mb__validat_card__1)
    (and card-placeholders?
         (= (:type error) :missing-table-alias)
         (parse-card-placeholder (:name error)))
    nil

    (not= (:type error) :missing-column)
    error

    :else
    (let [source (extract-source-entity card-placeholders? col-spec)]
      (cond
        ;; Table source
        (and (map? source) (= (:kind source) :table))
        (if-let [table-id (resolve-table-id driver mp (:spec source))]
          (assoc error :source-entity-type :table :source-entity-id table-id)
          error)

        ;; Card placeholder source — check column against card metadata
        (and (map? source) (= (:kind source) :card))
        (let [card-id (:card-id source)]
          (if (card-column-exists? driver mp card-id (:name error))
            nil ;; column is valid, suppress error
            (assoc error :source-entity-type :card :source-entity-id card-id)))

        ;; Multiple/ambiguous sources
        (= source :multiple)
        (assoc error :source-entity-type :unknown)

        ;; nil — unknown structure, leave unenriched for fallback
        :else error))))

(defn- validate-with-sources
  "Validate a compiled native query, enriching errors with source entity information
   derived from the col-spec's source-columns.
   When card-placeholders? is true, card placeholder sources are recognized and valid
   columns are filtered out (enrich-error returns nil)."
  [driver compiled card-placeholders?]
  (let [sql (lib/raw-native-query compiled)
        mp (lib/->metadata-provider compiled)
        {:keys [used-fields returned-fields errors]} (sql-tools/field-references driver sql)
        check-fields (fn [fields]
                       (mapcat (fn [col-spec]
                                 (->> (sql-tools/resolve-field driver mp col-spec)
                                      (keep :error)
                                      (keep (partial enrich-error driver mp card-placeholders? col-spec))))
                               fields))]
    (into #{}
          (map (partial driver.sql/normalize-error driver))
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
                   (empty? tables)
                   nil

                   (= 1 (count tables))
                   (let [table-spec (first tables)]
                     (if-let [table-id (if (int? (:table table-spec))
                                         (:table table-spec)
                                         (resolve-table-id driver mp table-spec))]
                       {:source-entity-type :table
                        :source-entity-id   table-id}
                       {:source-entity-type :unknown}))

                   :else
                   {:source-entity-type :unknown})]
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
  (into #{}
        (map #(cond-> % (= :unknown (:source-entity-type %)) (dissoc :source-entity-type :source-entity-id)))
        (if (has-card-template-tags? query)
          (if-let [compiled (compile-toplevel-query query)]
            (let [errors (validate-with-sources driver compiled true)]
              (if (empty? errors)
                errors
                (fallback-enrich driver compiled errors)))
            ;; Fallback: cards with placeholder collision
            (driver/validate-native-query-fields driver (compile-query query)))
          (let [compiled (compile-query query)
                errors   (validate-with-sources driver compiled false)]
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

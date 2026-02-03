(ns metabase.sql-tools.macaw.core
  (:require
   [clojure.set :as set]
   [macaw.core :as macaw]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.sql-tools.common :as sql-tools.common]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.sql-tools.macaw.references :as sql-tools.macaw.references]
   [metabase.util.humanization :as u.humanization]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

;;;; Macaw options and parsing

(def ^:private considered-drivers
  "The set of drivers for which we configure non-trivial macaw options."
  #{:h2 :mysql :postgres :redshift :sqlite :sqlserver})

(defn- macaw-options
  "Generate the options expected by Macaw based on the nature of the given driver."
  [driver]
  (merge
   ;; If this isn't a driver we've considered, fallback to Macaw's conservative defaults.
   (when (contains? considered-drivers driver)
     {;; According to the SQL-92 specification, non-quoted identifiers should be case-insensitive, and the majority of
      ;; engines are implemented this way.
      ;;
      ;; In practice there are exceptions, notably MySQL and SQL Server, where case sensitivity is a property of the
      ;; underlying resource referenced by the identifier, and the case-sensitivity does not depend on whether the
      ;; reference is quoted.
      ;;
      ;; For MySQL the case sensitivity of databases and tables depends on both the underlying file system, and a system
      ;; variable used to initialize the database. For SQL Server it depends on the collation settings of the collection
      ;; where the corresponding schema element is defined.
      ;;
      ;; For MySQL, columns and aliases can never be case-sensitive, and for SQL Server the default collation is case-
      ;; insensitive too, so it makes sense to just treat all databases as case-insensitive as a whole.
      ;;
      ;; In future, Macaw may support discriminating on the identifier type, in which case we could be more precise for
      ;; these databases. Being 100% correct would require querying system variables and schema configuration however,
      ;; which is likely a step too far in complexity.
      ;;
      ;; Currently, we go with :agnostic, as it is the most relaxed semantics (the case of both the identifiers and the
      ;; underlying schema is totally ignored, and correspondence is non-deterministic), but Macaw supports more nuanced
      ;; :lower and :upper configuration values which coerce the query identifiers to a given case then do an exact
      ;; comparison with the schema.
      :case-insensitive      :agnostic
      ;; For both MySQL and SQL Server, whether identifiers are case-sensitive depends on database configuration only,
      ;; and quoting has no effect on this, so we disable this option for consistency with `:case-insensitive`.
      :quotes-preserve-case? (not (contains? #{:mysql :sqlserver} driver))
      :features              {:postgres-syntax        (isa? driver/hierarchy driver :postgres)
                              :square-bracket-quotes  (= :sqlserver driver)
                              :unsupported-statements false
                              :backslash-escape-char  true
                              ;; This will slow things down, but until we measure the difference, opt for correctness.
                              :complex-parsing        true}
      ;; 10 seconds
      :timeout               10000})
   {;; There is no plan to be exhaustive yet.
    ;; Note that while an allowed list would be more conservative, at the time of writing only 1 of the bundled
    ;; drivers use FINAL as a reserved word, and mentioning them all would be prohibitive.
    ;; In the future, we will use multimethods to define this explicitly per driver, or even discover it automatically
    ;; through the JDBC connection, where possible.
    :non-reserved-words    (vec (remove nil? [(when-not (contains? #{:clickhouse} driver)
                                                :final)]))}))

(defn- parsed-query
  "Parse SQL using Macaw with driver-specific options."
  [sql driver & {:as opts}]
  (let [result (macaw/parsed-query sql (merge (macaw-options driver) opts))]
    ;; TODO (lbrdnk 2026-01-23): In follow-up work we should ensure that failure to parse is not silently swallowed.
    ;;                           I'm leaving that off at the moment to avoid potential log flooding.
    #_(when (and (map? result) (some? (:error result)))
        (throw (ex-info "SQL parsing failed."
                        {:macaw-error (:error result)}
                        (-> result :context :cause))))
    result))

;;;; referenced-tables

;; TODO: Proper schema
;; FKA driver/native-query-deps :sql
;; TODO: handling for other driver impls
;; #_#_:- ::driver/native-query-deps
(mu/defn referenced-tables
  "WIP"
  [driver :- :keyword
   query  :- :metabase.lib.schema/native-only-query]
  (let [db-tables (lib.metadata/tables query)
        db-transforms (lib.metadata/transforms query)]
    (-> query
        lib/raw-native-query
        (parsed-query driver)
        (macaw/query->components {:strip-contexts? true})
        :tables
        (->> (map :component))
        (->> (into #{} (keep #(->> (sql-tools.common/normalize-table-spec driver %)
                                   (sql-tools.common/find-table-or-transform driver db-tables db-transforms))))))))

(defmethod sql-tools/referenced-tables-impl :macaw
  [_parser driver query]
  (referenced-tables driver query))

;;;; returned-columns

(defmulti ^:private resolve-field
  "Resolves a field reference to one or more actual database fields.

  This uses a supplied metadata provider instead of hitting the db directly.  'Field reference' refers to the field
  references returned by sql-tools.macaw.references/field-references.

  Note: this currently sets :lib/desired-column-alias but no other :lib/* fields, because the callers of this function
  don't need the other fields.  If we care about other :lib/* fields in the future, we can add them then."
  {:added "0.57.0" :arglists '([driver metadata-provider col-spec])}
  (fn [_driver _metadata-provider col-spec]
    (:type col-spec)))

(defmethod resolve-field :all-columns
  [driver metadata-provider col-spec]
  (or (some->> (:table col-spec)
               (sql-tools.common/find-table-or-transform
                driver (lib.metadata/tables metadata-provider) (lib.metadata/transforms metadata-provider))
               :table
               (lib.metadata/active-fields metadata-provider)
               (map #(-> (assoc % :lib/desired-column-alias (:name %))
                         sql-tools.macaw.references/wrap-col)))
      [{:error (lib/missing-table-alias-error
                (sql-tools.macaw.references/table-name (:table col-spec)))}]))
;;
(defmethod resolve-field :single-column
  [driver metadata-provider {:keys [alias] :as col-spec}]
  [(if-let [{:keys [name] :as found}
            (->> (:source-columns col-spec)
                 (some (fn [source-col-set]
                         ;; in cases like `select (select blah from ...) from ...`, if blah refers to a
                         ;; column in both the inner query and the outer query, the column from the inner
                         ;; query will be preferred.  However, if blah doesn't refer to something in the
                         ;; inner query, it can also refer to something in the outer query.
                         ;; sql-tools.macaw.references/field-references organizes source-cols into a list of lists
                         ;; to account for this.
                         (->> (mapcat (fn [current-col]
                                        ;; :unknown-columns is a placeholder for "we know there are columns being
                                        ;; returned, but have no way of knowing what those are -- this is primarily
                                        ;; used for table-functions like `select * from my_func()`.  If we encounter
                                        ;; something like that, assume that the query is valid and make up a matching
                                        ;; column to avoid false positives.
                                        (if (= (:type current-col) :unknown-columns)
                                          (let [name (:column col-spec)]
                                            [{:base-type :type/*
                                              :name name
                                              :display-name (->> name (u.humanization/name->human-readable-name :simple))
                                              :effective-type :type/*
                                              :semantic-type :Semantic/*}])
                                          (keep :col (resolve-field driver metadata-provider current-col))))
                                      source-col-set)
                              (some #(when (= (:name %) (:column col-spec))
                                       %))))))]
     {:col (assoc found :lib/desired-column-alias (or alias name))}
     {:error (lib/missing-column-error (:column col-spec))})])

(defn- get-name [m]
  (or (:alias m) (str (gensym "new-col"))))

(defn- get-display-name [m]
  (->> (get-name m)
       (u.humanization/name->human-readable-name :simple)))

(defmethod resolve-field :custom-field
  [_driver _metadata-provider col-spec]
  [{:col {:base-type :type/*
          :name (get-name col-spec)
          :lib/desired-column-alias (get-name col-spec)
          :display-name (get-display-name col-spec)
          :effective-type :type/*
          :semantic-type :Semantic/*}}])

(defn- lca [default-type & types]
  (let [ancestor-sets (for [t types
                            :when t]
                        (conj (set (ancestors t)) t))
        common-ancestors (when (seq ancestor-sets)
                           (apply set/intersection ancestor-sets))]
    (if (seq common-ancestors)
      (apply (partial max-key (comp count ancestors)) common-ancestors)
      default-type)))

(defmethod resolve-field :composite-field
  [driver metadata-provider col-spec]
  (let [member-fields (mapcat #(->> (resolve-field driver metadata-provider %)
                                    (keep :col))
                              (:member-fields col-spec))]
    [{:col {:name (get-name col-spec)
            :lib/desired-column-alias (get-name col-spec)
            :display-name (get-display-name col-spec)
            :base-type (apply lca :type/* (map :base-type member-fields))
            :effective-type (apply lca :type/* (map :effective-type member-fields))
            :semantic-type (apply lca :Semantic/* (map :semantic-type member-fields))}}]))

(defmethod resolve-field :unknown-columns
  [_driver _metadata-provider _col-spec]
  [])

(defn- returned-columns
  [driver native-query]
  (let [{:keys [returned-fields]} (-> native-query
                                      lib/raw-native-query
                                      (parsed-query driver)
                                      macaw/->ast
                                      (->> (sql-tools.macaw.references/field-references driver)))]
    (mapcat #(->> (resolve-field driver native-query %)
                  (keep :col))
            returned-fields)))

(defmethod sql-tools/returned-columns-impl :macaw
  [_parser driver query]
  (returned-columns driver query))

(defn validate-query
  "Validate native query. TODO: limits; what this can and can not do."
  [driver native-query]
  (let [{:keys [used-fields returned-fields errors]} (-> native-query
                                                         lib/raw-native-query
                                                         (parsed-query driver)
                                                         macaw/->ast
                                                         (->> (sql-tools.macaw.references/field-references driver)))
        check-fields #(mapcat (fn [col-spec]
                                (->> (resolve-field driver (lib/->metadata-provider native-query) col-spec)
                                     (keep :error)))
                              %)]
    (-> errors
        (into (check-fields used-fields))
        (into (check-fields returned-fields)))))

(defmethod sql-tools/validate-query-impl :macaw
  [_parser driver query]
  (validate-query driver query))

(defmethod sql-tools/referenced-tables-raw-impl :macaw
  [_parser _driver sql-str]
  (vec (:tables (macaw/query->tables sql-str {:mode :compound-select}))))

(defmethod sql-tools/simple-query?-impl :macaw
  [_parser sql-string]
  (try
    ;; BEWARE: No driver available, so we pass nil. This means macaw-options will be minimal.
    (let [^net.sf.jsqlparser.statement.select.PlainSelect parsed (parsed-query sql-string nil)]
      (cond
        (not (instance? net.sf.jsqlparser.statement.select.PlainSelect parsed))
        {:is_simple false
         :reason "Not a simple SELECT"}

        (.getLimit parsed)
        {:is_simple false
         :reason "Contains a LIMIT"}

        (.getOffset parsed)
        {:is_simple false
         :reason "Contains an OFFSET"}

        (seq (.getWithItemsList parsed))
        {:is_simple false
         :reason "Contains a CTE"}

        :else
        {:is_simple true}))
    (catch Exception e
      (log/debugf e "Failed to parse query: %s" (ex-message e))
      {:is_simple false})))

(defmethod sql-tools/add-into-clause-impl :macaw
  [_parser driver sql table-name]
  (let [^net.sf.jsqlparser.statement.select.Select parsed-query (parsed-query sql driver)
        ^net.sf.jsqlparser.statement.select.PlainSelect select-body (.getSelectBody parsed-query)]
    (.setIntoTables select-body [(net.sf.jsqlparser.schema.Table. table-name)])
    (str parsed-query)))

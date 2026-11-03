(ns metabase-enterprise.semantic-layer-import.ossie.dialect
  "Which of an Ossie document's dialects the import reads.

  Every field and metric expression in an Ossie document comes in one or more *dialects*: the portable ones,
  `ANSI_SQL` and `OSSIE_SQL_2026` (the spec's own SQL, the only dialect it defines), and vendor ones, `SNOWFLAKE`,
  `BIGQUERY`, `DATABRICKS` and so on, among them expression languages that are not SQL at all (`MDX`, `DAX`,
  `TABLEAU`). The import reads one dialect for the whole document (see [[choose]]): the one the `:dialect` option
  names, else the one vendor SQL dialect the document uses, else the portable ones. Each expression is then read in
  that dialect, falling back to its portable forms (see [[pick]]), and an expression that has none of those is
  reported.

  The chosen vendor dialect also says which warehouse the document was written for, and so which Metabase driver
  (see [[warehouse]]), which [[metabase-enterprise.semantic-layer-import.core/check-driver]] holds the config's
  `:driver` to; a document read in the portable dialects names no warehouse, and the config is taken at its word. The
  same mapping gives the sqlglot dialect the metric SQL is parsed in before it is handed to the IR (see
  [[sqlglot-dialect]])."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.semantic-layer-import.ossie.document :as document]
   [metabase-enterprise.semantic-layer-import.schemas.ir :as ir]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(def portable
  "The dialects whose SQL is read as the warehouse's own, in the order they are tried when the chosen dialect has no
  form of an expression: `ANSI_SQL` first, since it is the one every Ossie writer emits and the one whose functions the
  SQL converter knows best, then `OSSIE_SQL_2026`, the spec's portable SQL, whose own functions (`NVL`, `IFF`,
  `DATEADD`) mostly do not convert."
  ["ANSI_SQL" "OSSIE_SQL_2026"])

(def ^:private vendor->driver
  "A vendor SQL dialect, normalized (see [[normalize]]), to the Metabase driver for the warehouse it is the SQL of.
  The names are the catalog's (apache/ossie `extensions/dialects.md`) and the ones writers use beside them."
  {"SNOWFLAKE"  :snowflake
   "DATABRICKS" :databricks
   "BIGQUERY"   :bigquery-cloud-sdk
   "TRINO"      :starburst
   "STARBURST"  :starburst
   "PRESTO"     :presto-jdbc
   "ATHENA"     :athena
   "CLICKHOUSE" :clickhouse
   "POSTGRES"   :postgres
   "POSTGRESQL" :postgres
   "REDSHIFT"   :redshift
   "MYSQL"      :mysql
   "SQLSERVER"  :sqlserver
   "TSQL"       :sqlserver
   "SPARK"      :sparksql
   "ORACLE"     :oracle
   "SQLITE"     :sqlite
   "VERTICA"    :vertica
   "DRUID"      :druid})

(mu/defn normalize :- :string
  "`dialect` as the tables here spell it: upper-cased, trimmed, and without a `_SQL` suffix (`snowflake_sql` is
  `SNOWFLAKE`), except on the portable dialects, whose names end that way."
  [dialect :- :string]
  (let [upper (u/upper-case-en (str/trim dialect))]
    (if (or (contains? (set portable) upper) (not (str/ends-with? upper "_SQL")))
      upper
      (subs upper 0 (- (count upper) 4)))))

(mu/defn portable? :- :boolean
  "Is `dialect` one of the [[portable]] SQL dialects?"
  [dialect :- :string]
  (contains? (set portable) (normalize dialect)))

(mu/defn vendor-sql? :- :boolean
  "Is `dialect` a vendor SQL dialect the import knows the warehouse of (see [[vendor->driver]])? `MDX` or `DAX` is
  not: it is no SQL, and nothing here reads it."
  [dialect :- :string]
  (contains? vendor->driver (normalize dialect)))

(mr/def ::chosen
  "The dialect the document is read in: a vendor SQL dialect, normalized, or nil for the portable ones."
  [:maybe :string])

(mu/defn choose :- ::chosen
  "The dialect to read a document in whose expressions come in `used`, the dialect names they carry, given the
  `:dialect` option `option` (nil for none): the option, which has to be a SQL dialect the import knows; else the one
  vendor SQL dialect the document uses, since a document that writes its SQL for one warehouse was written for it;
  else nil, the portable dialects, which is also what a document that uses several vendor dialects gets, the option
  saying which to prefer. Throws for an option the import cannot read: the run as a whole asked for something it
  cannot do."
  [option :- [:maybe :string]
   used   :- [:set :string]]
  (if option
    (cond
      (portable? option)   nil
      (vendor-sql? option) (normalize option)
      :else                (throw (ex-info (format (str "The :dialect option %s is not a SQL dialect the import reads:"
                                                        " name one of %s, or leave it out for the portable ones (%s)")
                                                   (pr-str option)
                                                   (str/join ", " (sort (keys vendor->driver)))
                                                   (str/join ", " portable))
                                           {:dialect option})))
    (let [vendors (into (sorted-set) (comp (filter vendor-sql?) (map normalize)) used)]
      (when (= 1 (count vendors))
        (first vendors)))))

(mu/defn warehouse :- ::ir/warehouse
  "What the chosen dialect says about the warehouse the document was written for: the dialect and its driver, or
  nothing for the portable dialects."
  [chosen :- ::chosen]
  {:type   chosen
   :driver (get vendor->driver chosen)})

(mu/defn sqlglot-dialect :- [:maybe :string]
  "The sqlglot dialect the metric SQL is parsed in for the chosen dialect: the warehouse driver's, or nil, sqlglot's
  default, for the portable dialects."
  [chosen :- ::chosen]
  (some-> (get vendor->driver chosen) sql-tools/driver->dialect))

(mr/def ::picked
  "An expression in the dialect it was read in, see [[pick]]."
  [:map {:closed true}
   [:dialect    :string]
   [:expression :string]])

(mu/defn pick :- [:maybe ::picked]
  "The form of `expression` to read, given the `chosen` dialect: its entry in that dialect when there is one, else the
  first of the [[portable]] forms it has, `ANSI_SQL` then `OSSIE_SQL_2026`, where the top-level `sql` is the
  `OSSIE_SQL_2026` form and wins over an entry in `dialects` of that name, as the spec says. Nil when it has none of
  those."
  [chosen                      :- ::chosen
   {:keys [sql dialects]}      :- ::document/expression]
  (let [by-dialect (into {}
                         (map (fn [{:keys [dialect expression]}] [(normalize dialect) expression]))
                         (reverse dialects))
        by-dialect (cond-> by-dialect sql (assoc "OSSIE_SQL_2026" sql))
        candidates (cond->> portable chosen (cons chosen))]
    (some (fn [dialect]
            (when-let [text (get by-dialect dialect)]
              {:dialect dialect, :expression text}))
          candidates)))

(mu/defn used :- [:set :string]
  "Every dialect name the expressions `expressions` carry, the top-level `sql` counting as `OSSIE_SQL_2026`."
  [expressions :- [:sequential ::document/expression]]
  (into #{}
        (mapcat (fn [{:keys [sql dialects]}]
                  (cond->> (map :dialect dialects)
                    sql (cons "OSSIE_SQL_2026"))))
        expressions))

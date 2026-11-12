(ns metabase-enterprise.data-testing.compile
  "Pure SQL for a test run: the subject's query rewritten to read temp tables, and every query the run executes against
  them. No I/O.

    parsing  — `referenced-tables`, `dangling-qualifiers`
    rewrite  — `table-replacements`, `replace-tables`, `rewrite-query`
    queries  — `compile-input`, `rows-query`, `columns-query`, `row-count-query`, `comparison-query`

  Every identifier is built with `h2x/identifier` and every cast with `h2x/cast`, which quote what cannot be written
  bare, and every value is a bound parameter, so nothing an author writes is spliced into the SQL."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase-enterprise.data-testing.util :as data-testing.u]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr])
  (:import
   (java.util.regex Pattern)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Schemas -------------------------------------------------

(mr/def ::compiled-query
  "A compiled native query."
  [:map {:closed true}
   [:query  :string]
   [:params [:maybe [:sequential ::lib.schema.common/field-value]]]])

;; The name may be blank, as a transform's target name may be: the validator then refuses the test for what it lacks,
;; rather than a schema error about the target.
(mr/def ::output-table
  "A table that holds the output of the query under test, by schema and name. The name may be blank."
  [:map {:closed true}
   [:schema {:optional true} [:maybe :string]]
   [:name   :string]])

(mr/def ::table-key
  "A way a query can refer to a table, as a `sql-tools/replace-names` key."
  [:map {:closed true}
   [:schema {:optional true} [:maybe :string]]
   [:table  :string]])

(mr/def ::table-replacements
  "The `sql-tools/replace-names` `:tables` map from the input and output tables to their temp tables."
  [:map-of
   ::table-key
   [:map {:closed true}
    [:db     [:maybe :string]]
    [:schema [:maybe :string]]
    [:table  :string]]])

;;; ------------------------------------------------- Parsing -------------------------------------------------

(mu/defn referenced-tables :- [:set ::data-testing.schema/table]
  "The tables `sql` reads."
  [driver :- :keyword
   sql    :- :string]
  (into #{}
        (map (fn [{:keys [schema table]}] {:schema schema :name table}))
        (sql-tools/referenced-tables-raw driver sql {:fail-on-parse-error? true})))

(mu/defn dangling-qualifiers :- [:set :string]
  "The names qualifying a column in `sql` that are not a FROM-clause table or alias."
  [driver :- :keyword
   sql    :- :string]
  (into #{}
        (comp (filter (comp #{:missing-table-alias} :type))
              (map :name))
        (:errors (sql-tools/field-references driver sql))))

;;; ------------------------------------------------- Rewrite -------------------------------------------------

(mu/defn table-keys :- [:sequential ::table-key]
  "The ways a query can refer to the table `table` in `schema`: qualified, and bare when `schema` is the database's
  `default-schema`, the one an unqualified reference resolves to."
  [schema         :- [:maybe :string]
   table          :- :string
   default-schema :- [:maybe :string]]
  (cond-> []
    schema
    (conj {:schema schema :table table})

    (or (nil? schema)
        (= (data-testing.u/fold-identifier schema)
           (data-testing.u/fold-identifier default-schema)))
    (conj {:table table})))

(mu/defn table-replacements :- ::table-replacements
  "The replacements mapping each input's table to its temp table in `input->table`, and each of `output-tables` to
  `output-table`."
  [output-tables  :- [:sequential ::output-table]
   input->table   :- [:map-of ::data-testing.schema/input ::lib.schema.common/non-blank-string]
   output-table   :- ::lib.schema.common/non-blank-string
   default-schema :- [:maybe :string]]
  (into {}
        (for [[{:keys [schema name]} table] (concat (map (fn [[input table]] [(:table input) table]) input->table)
                                                    (map (fn [output] [output output-table]) output-tables))
              table-key                    (table-keys schema name default-schema)]
          [table-key {:db nil :schema nil :table table}])))

(def output-name
  "The bare table name [[replace-tables]] writes for an output token. A subject whose output has no real table lists
  `{:schema nil :name output-name}` among its output tables."
  "__mb_output")

(mr/def ::output-token
  "A placeholder SQL may write for the output, such as `{{output}}`: a name in double braces."
  [:re #"^\{\{\s*[^{}\s]+\s*\}\}$"])

(mu/defn- replace-output-token :- :string
  "`sql` with every occurrence of `output-token`, whitespace inside its braces allowed, replaced by [[output-name]]."
  [sql          :- :string
   output-token :- ::output-token]
  (let [inner (second (re-find #"^\{\{\s*(.+?)\s*\}\}$" output-token))]
    (str/replace sql
                 (re-pattern (str "\\{\\{\\s*" (Pattern/quote inner) "\\s*\\}\\}"))
                 (constantly output-name))))

(mu/defn replace-tables :- :string
  "`sql` reading from the temp tables of `replacements` instead of the tables they replace.

  With `output-token`, every occurrence of it, whitespace inside its braces allowed, first becomes [[output-name]],
  string literals included."
  ([driver       :- :keyword
    sql          :- :string
    replacements :- ::table-replacements]
   (replace-tables driver sql replacements nil))
  ([driver       :- :keyword
    sql          :- :string
    replacements :- ::table-replacements
    output-token :- [:maybe ::output-token]]
   (sql-tools/replace-names driver
                            (cond-> sql
                              output-token (replace-output-token output-token))
                            {:tables replacements}
                            {:allow-unused? true})))

(mu/defn rewrite-query :- ::compiled-query
  "`compiled` reading from the temp tables of `replacements` instead of the tables they replace."
  [driver       :- :keyword
   compiled     :- ::compiled-query
   replacements :- ::table-replacements]
  (update compiled :query #(replace-tables driver % replacements)))

;;; ------------------------------------------------- Queries -------------------------------------------------

(defn- compiled
  "`honeysql` formatted for `driver` as a compiled query."
  [driver
   honeysql]
  (let [[query & params] (sql.qp/format-honeysql driver honeysql)]
    {:query query :params (vec params)}))

(defn- from
  "The temp table `table` as a `:from` entry."
  [table]
  [(h2x/identifier :table table)])

(defn- field
  "`column-name` as a column reference."
  [column-name]
  (h2x/identifier :field column-name))

(defn- as
  "`alias-name` as a column or table alias, also the shape a bare expression takes as a `:select` entry."
  ([alias-name]
   [alias-name])
  ([identifier-type
    alias-name]
   [(h2x/identifier identifier-type alias-name)]))

(def ^:private no-rows
  "A condition no row satisfies."
  [:= [:inline 1] [:inline 0]])

(mu/defn rows-query :- ::compiled-query
  "The query returning the literal `rows` over `columns`, each cell cast to its column's `cast_type` and named by
  the matching entry of `sql-names`."
  [driver    :- :keyword
   columns   :- [:sequential ::data-testing.schema/column]
   sql-names :- [:sequential :string]
   rows      :- [:sequential ::data-testing.schema/row]]
  (let [select-row (fn [row]
                     {:select (mapv (fn [{:keys [name cast_type]} sql-name]
                                      [(h2x/cast cast_type (get row name)) (as :field-alias sql-name)])
                                    columns
                                    sql-names)})
        relation   (if (seq rows)
                     {:union-all (mapv select-row rows)}
                     (assoc (select-row {}) :where no-rows))]
    (compiled driver {:select [:*] :from [[relation (as :table-alias "mb_rows")]]})))

(mu/defn columns-query :- ::compiled-query
  "The query returning no rows from the temp table `table`, for its columns."
  [driver :- :keyword
   table  :- :string]
  (compiled driver {:select [:*] :from [(from table)] :where no-rows}))

(mu/defn row-count-query :- ::compiled-query
  "The query counting the rows of the temp table `table`."
  [driver :- :keyword
   table  :- :string]
  (compiled driver {:select [[[:count [:inline 1]] (as :field-alias "__mb_count")]]
                    :from   [(from table)]}))

(mu/defn comparison-query :- ::compiled-query
  "The query returning each row over the columns `sql-names` whose count differs between the temp tables `output-table`
  and `expected-table`, followed by how many more times it appears in `output-table`."
  [driver         :- :keyword
   output-table   :- :string
   expected-table :- :string
   sql-names      :- [:sequential :string]]
  (let [columns (mapv field sql-names)
        src     (field "__mb_src")
        tagged  (fn [table tag]
                  {:select (conj (mapv as columns) [[:inline tag] (as :field-alias "__mb_src")])
                   :from   [(from table)]})]
    (compiled driver {:select   (conj (mapv as columns) [[:sum src] (as :field-alias "__mb_delta")])
                      :from     [[{:union-all [(tagged output-table 1)
                                               (tagged expected-table -1)]}
                                  (as :table-alias "__mb_comparison")]]
                      :group-by columns
                      :having   [:<> [:sum src] [:inline 0]]})))

;;; ------------------------------------------------- Inputs --------------------------------------------------

(defmulti compile-input
  "The query returning the test data of `input`."
  {:arglists '([driver input])}
  (fn [_driver input]
    (:format input)))

(mu/defmethod compile-input :sql :- ::compiled-query
  [_driver :- :keyword
   input   :- ::data-testing.schema/input]
  {:query (:sql input), :params []})

(mu/defmethod compile-input :rows :- ::compiled-query
  [driver                 :- :keyword
   {:keys [columns rows]} :- ::data-testing.schema/input]
  (rows-query driver columns (mapv :name columns) rows))

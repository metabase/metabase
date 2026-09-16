(ns metabase.transform-testing.compile
  "Pure SQL for a transform test run: the transform's source rewritten to read temp tables, and every query the run
  executes against them. No I/O.

    parsing  — `compile-source`, `referenced-tables`, `dangling-qualifiers`
    rewrite  — `table-replacements`, `replace-tables`, `compile-transform`
    queries  — `compile-input`, `rows-query`, `columns-query`, `row-count-query`, `comparison-query`

  Every identifier is built with `h2x/identifier` and every cast with `h2x/cast`, which quote what cannot be written
  bare, and every value is a bound parameter, so nothing an author writes is spliced into the SQL."
  (:require
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.transform-testing.schema :as transform-testing.schema]
   [metabase.transform-testing.util :as transform-testing.u]
   [metabase.transforms-base.schema :as transforms-base.schema]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Schemas -------------------------------------------------

(mr/def ::compiled-query
  "A compiled native query."
  [:map {:closed true}
   [:query  :string]
   [:params [:maybe [:sequential ::lib.schema.common/field-value]]]])

(mr/def ::compiled-source
  "The transform's source compiled to SQL, before any temp-table replacement, with the tables it reads."
  [:map {:closed true}
   [:query             :string]
   [:params            [:maybe [:sequential ::lib.schema.common/field-value]]]
   [:referenced-tables [:set ::transform-testing.schema/table]]])

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

(mu/defn referenced-tables :- [:set ::transform-testing.schema/table]
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

(mu/defn compile-source :- ::compiled-source
  "The transform's source compiled to SQL, with the tables it reads."
  [driver    :- :keyword
   transform :- ::transforms-base.schema/transform]
  (let [{:keys [query params]} (transforms-base.u/compile-source transform nil)]
    {:query             query
     :params            params
     :referenced-tables (referenced-tables driver query)}))

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
        (= (transform-testing.u/fold-identifier schema)
           (transform-testing.u/fold-identifier default-schema)))
    (conj {:table table})))

(mu/defn table-replacements :- ::table-replacements
  "The replacements mapping each input's table to its temp table in `input->table`, and the transform's target table to
  `output-table`."
  [transform      :- ::transforms-base.schema/transform
   input->table   :- [:map-of ::transform-testing.schema/input ::lib.schema.common/non-blank-string]
   output-table   :- ::lib.schema.common/non-blank-string
   default-schema :- [:maybe :string]]
  (let [{target-schema :schema target-name :name} (:target transform)]
    (into {}
          (for [[{:keys [schema name]} table] (conj (mapv (fn [[input table]] [(:table input) table]) input->table)
                                                    [{:schema target-schema :name target-name} output-table])
                table-key                    (table-keys schema name default-schema)]
            [table-key {:db nil :schema nil :table table}]))))

(mu/defn replace-tables :- :string
  "`sql` reading from the temp tables of `replacements` instead of the tables they replace."
  [driver       :- :keyword
   sql          :- :string
   replacements :- ::table-replacements]
  (sql-tools/replace-names driver sql {:tables replacements} {:allow-unused? true}))

(mu/defn compile-transform :- ::compiled-query
  "`compiled-source` reading from the temp tables of `replacements` instead of the tables they replace."
  [driver          :- :keyword
   compiled-source :- ::compiled-source
   replacements    :- ::table-replacements]
  {:query  (replace-tables driver (:query compiled-source) replacements)
   :params (:params compiled-source)})

;;; ------------------------------------------------- Queries -------------------------------------------------

(defn- compiled
  "`honeysql` formatted for `driver` as a compiled query."
  [driver honeysql]
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
  ([identifier-type alias-name]
   [(h2x/identifier identifier-type alias-name)]))

(def ^:private no-rows
  "A condition no row satisfies."
  [:= [:inline 1] [:inline 0]])

(mu/defn rows-query :- ::compiled-query
  "The query returning the literal `rows` over `columns`, each cell cast to its column's `database_type` and named by
  the matching entry of `sql-names`."
  [driver    :- :keyword
   columns   :- [:sequential ::transform-testing.schema/column]
   sql-names :- [:sequential :string]
   rows      :- [:sequential ::transform-testing.schema/row]]
  (let [select-row (fn [row]
                     {:select (mapv (fn [{:keys [name database_type]} sql-name]
                                      [(h2x/cast database_type (get row name)) (as :field-alias sql-name)])
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
   input   :- ::transform-testing.schema/input]
  {:query (:sql input), :params []})

(mu/defmethod compile-input :rows :- ::compiled-query
  [driver                 :- :keyword
   {:keys [columns rows]} :- ::transform-testing.schema/input]
  (rows-query driver columns (mapv :name columns) rows))

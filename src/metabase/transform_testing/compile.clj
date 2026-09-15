(ns metabase.transform-testing.compile
  "Compiles the inputs and the transform of a transform test to queries over temp tables."
  (:require
   [metabase.driver :as driver]
   [metabase.driver.sql.normalize :as sql.normalize]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.transform-testing.schema :as transform-testing.schema]
   [metabase.transforms-base.schema :as transforms-base.schema]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(mr/def ::compiled-query
  "A compiled native query."
  [:map {:closed true}
   [:query  :string]
   [:params [:maybe [:sequential :any]]]])

(mr/def ::table-replacements
  "The `sql-tools/replace-names` `:tables` map from the input and output tables to their temp tables."
  [:map-of
   [:map {:closed true}
    [:schema {:optional true} [:maybe :string]]
    [:table :string]]
   [:map {:closed true}
    [:schema [:maybe :string]]
    [:table :string]]])

(mu/defn- table-keys :- [:sequential [:map {:closed true}
                                      [:schema {:optional true} [:maybe :string]]
                                      [:table :string]]]
  "The ways a query can refer to the table `table-name` in `schema`: qualified, and bare when `schema` is the default
  one."
  [driver     :- :keyword
   schema     :- [:maybe :string]
   table-name :- :string]
  (cond-> []
    schema
    (conj {:schema schema :table table-name})

    (or (nil? schema) (= schema (sql.normalize/default-schema driver)))
    (conj {:table table-name})))

(mu/defn table-replacements :- ::table-replacements
  "The replacements of the tables of `inputs` and the target table of `transform` with the temp tables
  `input-temp-tables` and `output-temp-table`."
  [driver            :- :keyword
   transform         :- ::transforms-base.schema/transform
   inputs            :- ::transform-testing.schema/inputs
   input-temp-tables :- [:sequential ::lib.schema.common/non-blank-string]
   output-temp-table :- ::lib.schema.common/non-blank-string]
  (let [{target-schema :schema target-name :name} (:target transform)]
    (into {}
          (for [[{:keys [schema name]} temp-table] (conj (mapv vector (map :table inputs) input-temp-tables)
                                                         [{:schema target-schema :name target-name} output-temp-table])
                table-key                         (table-keys driver schema name)]
            [table-key {:schema nil :table temp-table}]))))

(mu/defn replace-tables :- :string
  "`sql` reading from the temp tables of `replacements` instead of the tables they replace."
  [driver       :- :keyword
   sql          :- :string
   replacements :- ::table-replacements]
  (sql-tools/replace-names driver sql {:tables replacements} {:allow-unused? true}))

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
  [driver :- :keyword
   input  :- ::transform-testing.schema/input]
  (driver/compile-rows-query driver (:columns input) (:rows input)))

(mu/defn compile-transform :- ::compiled-query
  "The query of the query transform `transform`, reading from the temp tables of `replacements` instead of its input
  tables."
  [driver       :- :keyword
   transform    :- ::transforms-base.schema/transform
   replacements :- ::table-replacements]
  (let [{:keys [query params]} (transforms-base.u/compile-source transform nil)]
    {:query  (replace-tables driver query replacements)
     :params params}))

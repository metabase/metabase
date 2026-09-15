(ns metabase.transform-testing.compile
  "Pure SQL: turn a transform test's inputs and transform into queries over temp tables. No I/O — same
  arguments, same SQL, so everything here is testable with string/data assertions and no warehouse.

  The transform's source is compiled ONCE (`compile-source`, before any replacement) and that one
  result feeds two consumers, so they can never disagree about what the transform reads:
  - the validator checks its `:referenced-tables` are all faked (Guard A);
  - `compile-transform` rewrites that same source's references to the temp tables.

  Three things get compiled:
  - inputs      → `compile-input`      : a query producing each input's fake data (rows or sql);
  - the source  → `compile-source`     : the transform's SQL + the tables it reads (no replacement);
  - the rewrite → `compile-transform`  : that source, references remapped to temp tables.

  Remapping is `sql-tools/replace-names` (pure, AST-level) over a `table-replacements` map; the
  runner supplies the temp-table names. Everything the executor later runs is produced here as
  plain SQL strings + params."
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

(mr/def ::table
  "A table by schema and name, as parsed from a query or declared as an input."
  [:map {:closed true}
   [:schema [:maybe :string]]
   [:name   :string]])

(mr/def ::compiled-source
  "The transform's source compiled to SQL, before any temp-table replacement, plus the tables it
  reads. Compiled once and threaded to both validation (are all reads faked?) and replacement, so
  the guard and the rewrite operate on the same tables."
  [:map {:closed true}
   [:query             :string]
   [:params            [:maybe [:sequential :any]]]
   [:referenced-tables [:set ::table]]])

(mr/def ::table-replacements
  "The `sql-tools/replace-names` `:tables` map from the input and output tables to their temp tables."
  [:map-of
   [:map {:closed true}
    [:schema {:optional true} [:maybe :string]]
    [:table :string]]
   [:map {:closed true}
    [:db [:maybe :string]]
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
            [table-key {:db nil :schema nil :table temp-table}]))))

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

(mu/defn compile-source :- ::compiled-source
  "Compile the transform's source to SQL and parse the tables it reads — *before* any replacement.
  Compiled once by the runner and fed to both input validation and [[compile-transform]], so the
  guard checks exactly the tables the rewrite will remap (no second compile, no drift)."
  [driver    :- :keyword
   transform :- ::transforms-base.schema/transform]
  (let [{:keys [query params]} (transforms-base.u/compile-source transform nil)]
    {:query             query
     :params            params
     :referenced-tables (into #{}
                              (map (fn [{:keys [schema table]}] {:schema schema :name table}))
                              (sql-tools/referenced-tables-raw driver query {:fail-on-parse-error? true}))}))

(mu/defn compile-transform :- ::compiled-query
  "The query transform's `compiled-source` rewritten to read from the temp tables of `replacements`
  instead of its input tables. Takes the already-compiled source (see [[compile-source]]) rather
  than recompiling."
  [driver          :- :keyword
   compiled-source :- ::compiled-source
   replacements    :- ::table-replacements]
  {:query  (replace-tables driver (:query compiled-source) replacements)
   :params (:params compiled-source)})

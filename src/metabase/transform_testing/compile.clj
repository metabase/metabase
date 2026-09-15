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
  plain SQL strings + params.

  Also home to the pieces an expectation type needs to compile its own SQL: literal rows as a
  relation, and the checks that keep author-supplied text out of the SQL."
  (:require
   [clojure.string :as str]
   [metabase.driver :as driver]
   [metabase.driver.sql.normalize :as sql.normalize]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.transform-testing.errors :as transform-testing.errors]
   [metabase.transform-testing.schema :as transform-testing.schema]
   [metabase.transforms-base.schema :as transforms-base.schema]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

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
  "The replacements mapping the input tables (and the transform's target table) to their temp tables.
  `input->temp` maps each input to the temp table built for it — the association the runner owns; the
  target table maps to `output-temp-table`."
  [driver            :- :keyword
   transform         :- ::transforms-base.schema/transform
   input->temp       :- [:map-of ::transform-testing.schema/input ::lib.schema.common/non-blank-string]
   output-temp-table :- ::lib.schema.common/non-blank-string]
  (let [{target-schema :schema target-name :name} (:target transform)]
    (into {}
          (for [[{:keys [schema name]} temp-table] (conj (mapv (fn [[input temp]] [(:table input) temp]) input->temp)
                                                         [{:schema target-schema :name target-name} output-temp-table])
                table-key                          (table-keys driver schema name)]
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

(mu/defn referenced-tables :- [:set ::table]
  "The tables referenced by an arbitrary compiled `sql` string, as `{:schema :name}` maps. Used by
  Guard B to re-parse the rewritten query and confirm every reference is a temp table (see
  [[metabase.transform-testing.validator/surviving-tables]]). Same parse as [[compile-source]]."
  [driver :- :keyword
   sql    :- :string]
  (into #{}
        (map (fn [{:keys [schema table]}] {:schema schema :name table}))
        (sql-tools/referenced-tables-raw driver sql {:fail-on-parse-error? true})))

(mu/defn dangling-qualifiers :- [:set :string]
  "The table names used to qualify a column in `sql` that are not a FROM-clause alias — the parser's
  `:missing-table-alias` field errors. After the rewrite these are references to a real table whose
  FROM entry was remapped to a temp table (e.g. `people.id` left behind when `FROM people` became a
  temp table). Guard B ([[metabase.transform-testing.validator/surviving-references]]) rejects them."
  [driver :- :keyword
   sql    :- :string]
  (into #{}
        (comp (filter (comp #{:missing-table-alias} :type))
              (map :name))
        (:errors (sql-tools/field-references driver sql))))

(mu/defn compile-transform :- ::compiled-query
  "The query transform's `compiled-source` rewritten to read from the temp tables of `replacements`
  instead of its input tables. Takes the already-compiled source (see [[compile-source]]) rather
  than recompiling."
  [driver          :- :keyword
   compiled-source :- ::compiled-source
   replacements    :- ::table-replacements]
  {:query  (replace-tables driver (:query compiled-source) replacements)
   :params (:params compiled-source)})

;;; ------------------------------------- Literal rows as a SQL relation ---------------------------------------

(def ^:private unsafe-identifier-reasons
  "Why a column name cannot be rendered as one SQL identifier, by the character that makes it so.

  Cell values are always bound parameters, so a column name is the only author-supplied text that
  reaches the SQL. HoneySQL quotes it and doubles an embedded quote, and rejects a semicolon
  outright, but a dot it reads as qualification — `a.b` compiles to `\"a\".\"b\"`, a reference to
  some other table's column rather than to a column named `a.b`."
  {\; "it contains a semicolon"
   \" "it contains a double quote"
   \. "it contains a dot, which SQL reads as a table qualifier"})

(mu/defn unsafe-identifier-reason :- [:maybe :string]
  "Why `column-name` cannot be used as a SQL identifier, or nil when it can."
  [column-name :- :string]
  (or (some unsafe-identifier-reasons column-name)
      (when (some #(Character/isISOControl ^char %) column-name)
        "it contains a control character")))

(defn- parens-balanced?
  "Does every `)` in `s` close a `(` opened earlier in `s`, and is every `(` closed?

  Depth must never dip below zero, which is a stronger claim than equal counts: `INT)) FROM x ((`
  balances by count while still closing two parentheses it never opened."
  [^String s]
  (loop [depth 0, i 0]
    (cond
      (= i (.length s)) (zero? depth)
      :else             (case (.charAt s i)
                          \( (recur (inc depth) (inc i))
                          \) (when (pos? depth) (recur (dec depth) (inc i)))
                          (recur depth (inc i))))))

(mu/defn unsafe-database-type-reason :- [:maybe :string]
  "Why `database-type` cannot be used as a cast target, or nil when it can.

  A cast target cannot be a bound parameter — there is no `CAST(? AS ?)` — so a declared type is
  the one piece of author-supplied text that reaches the SQL as text, sitting inside
  `CAST(? AS «here»)`.

  What that position actually permits is narrow, and the check is narrow to match. To reach
  anything outside its own cast, the text has to close that parenthesis early; short of that it
  stays inside the call and the engine answers with a syntax error. So the rule is that
  parentheses must balance, plus a few characters that no type name contains and that would let
  text escape by another route: a semicolon, a string literal, a comment marker, or an unpaired
  double quote that would swallow the closing parenthesis.

  Deliberately NOT a list of what a type may look like. Type names vary far more than they first
  appear — `INT[]`, `public.my_enum`, `VARCHAR(MAX)`, `ARRAY<INT64>`,
  `INTERVAL DAY(2) TO SECOND(6)` — and an allowlist written from memory rejects real ones, which is
  a worse failure than admitting text that cannot do anything. This does still admit nonsense like
  `INT UNION SELECT x`; that is not an escape, it is a syntax error with extra steps."
  [database-type :- :string]
  (cond
    (str/blank? database-type)                                  "it is blank"
    (str/includes? database-type ";")                           "it contains a semicolon"
    (str/includes? database-type "'")                           "it contains a quote"
    (or (str/includes? database-type "--")
        (str/includes? database-type "/*"))                     "it contains a comment marker"
    (some #(Character/isISOControl ^char %) database-type)      "it contains a control character"
    (odd? (count (filter #(= \" %) database-type)))             "it has an unclosed double quote"
    (not (parens-balanced? database-type))                      "its parentheses are unbalanced"))

(mu/defn compiled :- ::compiled-query
  "`honeysql` formatted for `driver` as a compiled query."
  [driver   :- :keyword
   honeysql :- :map]
  (let [[query & params] (sql.qp/format-honeysql driver honeysql)]
    {:query query :params (vec params)}))

(defn- cast-target
  "`database-type` as a cast target, refusing it if it could escape the cast.

  Here rather than at any one caller: this is where the text stops being data and becomes SQL, so
  it is the only place a check cannot be forgotten. An expectation reaches it through
  [[rows-relation]] below; a `:rows` input will reach the same function through
  `driver/compile-rows-query`, and its author should not have to know to call a guard kept
  somewhere else."
  [database-type]
  (when-let [reason (unsafe-database-type-reason database-type)]
    (throw (transform-testing.errors/ex
            ::transform-testing.errors/unsafe-identifier
            (tru "The declared database_type {0} cannot be used as a cast target because {1}."
                 (pr-str database-type) reason)
            {:database-type database-type})))
  [:raw database-type])

(mu/defn rows-relation
  "A HoneySQL relation of the literal `rows`, one `SELECT` per row unioned together, each cell cast
  to its column's declared `database_type`.

  A cell is looked up by the name the author declared and aliased to `sql-names`, the spelling the
  table being compared against actually uses. Every cell is a bound parameter — nothing from the
  author's row data is rendered into the SQL text. The type names are, which is what
  [[cast-target]] checks."
  [columns   :- [:sequential ::transform-testing.schema/column]
   sql-names :- [:sequential :string]
   rows      :- [:sequential :map]]
  ;; Eager, and that matters: [[cast-target]] refuses a type that could escape its cast, and a lazy
  ;; `for` would defer that refusal until something realized the sequence — inside HoneySQL
  ;; formatting, well past any caller prepared to catch it. A guard that runs at an unpredictable
  ;; time is not a guard.
  {:union-all (mapv (fn [row]
                      {:select (mapv (fn [{:keys [name database_type]} sql-name]
                                       [[:cast (get row name) (cast-target database_type)]
                                        (keyword sql-name)])
                                     columns
                                     sql-names)})
                    rows)})

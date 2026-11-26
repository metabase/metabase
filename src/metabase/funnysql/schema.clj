(ns metabase.funnysql.schema
  "Malli schemas for the Honey SQL-shaped app-DB queries Funny SQL compiles, and for what it compiles them to."
  (:require
   [honey.sql.pg-ops]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::engine
  "An application database engine Funny SQL compiles for."
  [:enum :h2 :postgres :mysql])

(mr/def ::bound-value
  "A non-numeric, non-boolean value Funny SQL binds as a `?` parameter: a string, a UUID, a date or time (`java.time` or
  `java.util.Date`), or bytes (an array or a JDBC `Blob`)."
  [:or
   :string
   :uuid
   ms/TemporalInstant
   (ms/InstanceOfClass java.util.Date)
   [:fn {:error/message "a byte array"} bytes?]
   (ms/InstanceOfClass java.sql.Blob)])

(mr/def ::bindable
  "A value a `?` parameter can carry: `nil`, a boolean, a number, a keyword, a [[::bound-value]], or a collection of
  these."
  [:or
   :nil
   :boolean
   number?
   :keyword
   ::bound-value
   [:sequential [:schema [:ref ::bindable]]]
   [:set [:schema [:ref ::bindable]]]])

(mr/def ::options
  "The options Funny SQL compiles with: the Toucan 2 Honey SQL options it ignores, and the `:params` `[:param k]` reads."
  [:maybe
   [:map {:closed true}
    [:quoted       {:optional true} :boolean]
    [:dialect      {:optional true} :keyword]
    [:quoted-snake {:optional true} :boolean]
    [:params       {:optional true} [:map-of :keyword ::bindable]]]])

(mr/def ::context
  "The state of one compilation: the engine and options, and the SQL text and arguments written so far."
  [:map {:closed true}
   [:engine  ::engine]
   [:options ::options]
   [:sql     (ms/InstanceOfClass StringBuilder)]
   [:args    (ms/InstanceOfClass clojure.lang.Volatile)]])

(mr/def ::compiled
  "The `[sql & args]` Funny SQL compiles a query to."
  [:and
   vector?
   [:cat :string [:* ::bindable]]])

(def ^:private expr
  [:schema [:ref ::expr]])

(def ^:private subquery
  [:schema [:ref ::expr.subquery]])

(mr/def ::identifier
  "A table or column name: a keyword, possibly qualified with `.` or `/`."
  :keyword)

(mr/def ::alias
  "The name in `<x> AS <alias>`: a simple keyword."
  simple-keyword?)

(mr/def ::identifier-list
  "A parenthesized list of column names: one keyword, or a sequence or set of them."
  [:or :keyword [:sequential ::identifier] [:set ::identifier]])

(mr/def ::table-ref
  "A `FROM` or join source: a table name or subquery, or `[source]` / `[source alias]` where the source may also be a
  table function call."
  [:multi {:dispatch vector?}
   [true  [:and vector? [:cat [:or ::identifier subquery [:schema [:ref ::expr.call]]] [:? ::alias]]]]
   [false [:or ::identifier subquery]]])

(mr/def ::target-table
  "The table of `UPDATE`, `DELETE FROM` or `MERGE INTO`: a table name, or `[table]` / `[table alias]`."
  [:or ::identifier [:and vector? [:cat ::identifier [:? ::alias]]]])

(mr/def ::select-item
  "A `SELECT` item: an expression that is not a vector, or `[expr]` / `[expr alias]`."
  [:multi {:dispatch vector?}
   [true  [:and vector? [:cat expr [:? ::alias]]]]
   [false expr]])

(mr/def ::order-by-direction
  "An `:order-by` direction, with an optional placement of `NULL`s."
  [:enum :asc :desc :nulls-last :nulls-first :asc-nulls-last :desc-nulls-last :asc-nulls-first :desc-nulls-first])

(mr/def ::order-by-item
  "An `ORDER BY` item: an expression that is not a vector, or `[expr]` / `[expr direction]`."
  [:multi {:dispatch vector?}
   [true  [:and vector? [:cat expr [:? ::order-by-direction]]]]
   [false expr]])

(mr/def ::sequence-item
  "An item of a clause that takes one item or a sequence of them."
  [:or ::select-item ::order-by-item ::identifier ::single-item])

(mr/def ::single-item
  "The one item a clause that takes one item or a sequence of them may be given bare: an identifier, a literal value or
  a subquery."
  [:or [:schema [:ref ::expr.identifier]] [:schema [:ref ::expr.value]] subquery])

(mr/def ::assignments
  "Column to value assignments, as in `SET`."
  [:map-of ::identifier expr])

(mr/def ::unit
  "The unit of a `:date-add` interval."
  [:enum :millisecond :second :minute :hour :day :week :month :quarter :year])

(mr/def ::unit-name
  "A temporal unit spliced into the SQL text of `:extract` or `:timestampdiff`: a keyword or string of letters and
  digits."
  [:and
   [:or :keyword :string]
   [:fn {:error/message "a unit of letters and digits"} #(re-matches #"^[a-zA-Z0-9]+$" (name %))]])

(mr/def ::type-name
  "A type app-DB code casts to: one of the type keywords it uses, or `[:varchar n]`."
  [:or
   [:enum :boolean :char :date :float :integer :jsonb :oid :regclass :signed :text :timestamp
    :timestamp-with-time-zone :unsigned :varchar]
   [:tuple [:= :varchar] pos-int?]])

(mr/def ::column-type
  "A column type of `CREATE TABLE`: a keyword spelling spaces as dashes, a string, or `[:type & args]` like
  `[:varchar 26]`."
  [:or
   :keyword
   :string
   [:and vector? [:cat :keyword [:+ expr]]]])

(mr/def ::escape-char
  "The escape character of a `LIKE` pattern, spliced as a quoted literal."
  [:string {:min 1, :max 1}])

(mr/def ::inline-atom
  "A value `[:inline x]` splices into the SQL text."
  [:or :nil :boolean number?])

(mr/def ::inline-value
  "What `[:inline x]` splices: a number, boolean or `nil`, or a collection of them."
  [:or ::inline-atom [:sequential ::inline-atom] [:set ::inline-atom]])

(mr/def ::window
  "The window of an `:over` call."
  [:map {:closed true}
   [:partition-by {:optional true} [:schema [:ref ::clause.partition-by]]]
   [:order-by     {:optional true} [:schema [:ref ::clause.order-by]]]])

(mr/def ::in-values
  "The right-hand side of `:in`/`:not-in`: a list of expressions, a subquery, a `[:param k]` naming a collection, an
  `[:inline coll]` or `[:lift x]`, or `nil` or `{}`, which compile like an empty list."
  [:multi {:dispatch (fn [x]
                       (cond
                         (nil? x)                                 :nil
                         (= x {})                                 :empty-map
                         (map? x)                                 :subquery
                         (and (vector? x) (keyword? (first x)))   (first x)
                         (sequential? x)                          :list
                         (set? x)                                 :set
                         :else                                    ::invalid))}
   [:nil       :nil]
   [:empty-map [:= {} {}]]
   [:subquery  subquery]
   [:param     [:schema [:ref ::expr.param]]]
   [:inline    [:schema [:ref ::call.inline]]]
   [:lift      [:schema [:ref ::call.lift]]]
   [:list      [:sequential expr]]
   [:set       [:set expr]]])

(defn- call-schema
  "A schema for a call of an operator matching `op` whose arguments match the regex schemas `args`."
  [op & args]
  [:and vector? (into [:cat op] args)])

(mr/def ::call.=
  "`[:= x y]`, `x IS NULL` when either side is `nil`."
  (call-schema [:= :=] expr expr))

(mr/def ::call.<>
  "`[:<> x y]` (or `:!=`, `:not=`), `x IS NOT NULL` when either side is `nil`."
  (call-schema [:enum :<> :!= :not=] expr expr))

(mr/def ::call.and
  "`[:and & conditions]`, ignoring `nil`s."
  (call-schema [:= :and] [:* [:maybe expr]]))

(mr/def ::call.or
  "`[:or & conditions]`, ignoring `nil`s."
  (call-schema [:= :or] [:* [:maybe expr]]))

(mr/def ::call.not
  "`[:not condition]`."
  (call-schema [:= :not] expr))

(mr/def ::call.comparison
  "A binary comparison or pattern match, `[:< x y]`, `[:like x pattern]`, `[:is x y]` and the like."
  (call-schema [:enum :< :<= :> :>= :like :ilike :not-like :is :is-not] expr expr))

(mr/def ::call.arithmetic
  "Arithmetic or string concatenation, `[:+ & xs]`; `:+` and `:-` also take a single operand."
  [:multi {:dispatch #(contains? #{:+ :-} (first %))}
   [true  (call-schema [:enum :+ :-] [:+ expr])]
   [false (call-schema [:enum :* :/ :% :||] expr [:+ expr])]])

(mr/def ::call.between
  "`[:between x low high]`."
  (call-schema [:= :between] expr expr expr))

(mr/def ::call.case
  "`[:case condition value ... :else value]`."
  (call-schema [:= :case] [:+ [:cat expr expr]]))

(mr/def ::call.cast
  "`[:cast x type]`."
  (call-schema [:= :cast] expr ::type-name))

(mr/def ::call.composite
  "`[:composite & xs]`, a row constructor."
  (call-schema [:= :composite] [:+ expr]))

(mr/def ::call.current-timestamp
  "`[:current-timestamp]`, the current moment at the app DB's best precision: `now()`, or `now(6)` on MySQL."
  (call-schema [:= :current-timestamp]))

(mr/def ::call.date-add
  "`[:date-add x amount unit]`, `x` plus `amount` `unit`s."
  (call-schema [:= :date-add] expr number? ::unit))

(mr/def ::call.exists
  "`[:exists subquery]`."
  (call-schema [:= :exists] subquery))

(mr/def ::call.not-exists
  "`[:not-exists subquery]`."
  (call-schema [:= :not-exists] subquery))

(mr/def ::call.in
  "`[:in x values]`."
  (call-schema [:= :in] expr ::in-values))

(mr/def ::call.not-in
  "`[:not-in x values]`."
  (call-schema [:= :not-in] expr ::in-values))

(mr/def ::call.inline
  "`[:inline x]`, an [[::inline-value]] spliced into the SQL text instead of bound."
  [:tuple [:= :inline] ::inline-value])

(mr/def ::call.lift
  "`[:lift x]`, `x` bound as a `?` parameter whatever it is."
  [:tuple [:= :lift] ::bindable])

(mr/def ::call.over
  "`[:over [expr window]]`, a window function call."
  [:tuple [:= :over] [:tuple expr ::window]])

(mr/def ::call.timestampdiff
  "`[:timestampdiff unit x y]`, MySQL's `timestampdiff(unit, x, y)`."
  (call-schema [:= :timestampdiff] ::unit-name expr expr))

(mr/def ::call.extract
  "`[:extract unit x]`, `extract(unit FROM x)`."
  (call-schema [:= :extract] ::unit-name expr))

(mr/def ::call.distinct-count
  "`[:distinct-count x]`, `count(DISTINCT x)`."
  (call-schema [:= :distinct-count] expr))

(mr/def ::call.percentile-cont
  "`[:percentile-cont x fraction]`, the continuous percentile of `x` at `fraction`."
  (call-schema [:= :percentile-cont] expr number?))

(mr/def ::call.collate
  "`[:collate x collation]`, `x COLLATE collation`."
  (call-schema [:= :collate] expr [:or :keyword :string]))

(mr/def ::call.literal
  "`[:literal s]`, `s` spliced as a single-quoted string literal; only for hardcoded strings."
  [:tuple [:= :literal] [:or :string :keyword]])

(mr/def ::call.escape
  "`[:escape pattern escape-char]`, the `LIKE` pattern `pattern ESCAPE 'c'`."
  (call-schema [:= :escape] expr ::escape-char))

(mr/def ::call.position
  "`[:position substring s]`, `position(substring IN s)`."
  (call-schema [:= :position] expr expr))

(mr/def ::call.full-text-match
  "`[:@@ x y]`, the Postgres full text search match of two columns."
  (call-schema [:= honey.sql.pg-ops/atat] ::identifier ::identifier))

(def ^:private function-arities
  "Each whitelisted plain SQL function as `[f min-args max-args]`, `nil` meaning any number."
  [[:abs 1 1]
   [:any 1 1]
   [:avg 1 1]
   [:ceil 1 1]
   [:coalesce 1 nil]
   [:concat 1 nil]
   [:concat_ws 2 nil]
   [:count 1 1]
   [:current_database 0 0]
   [:current_setting 1 2]
   [:current_schema 0 0]
   [:database 0 0]
   [:date_part 2 2]
   [:dateadd 3 3]
   [:date_add 2 2]
   [:datediff 2 3]
   [:day 1 1]
   [:distinct 1 1]
   [:floor 1 1]
   [:greatest 1 nil]
   [:least 1 nil]
   [:isnull 1 2]
   [:json_contains_path 3 nil]
   [:json_search 3 nil]
   [:jsonb_build_object 0 nil]
   [:jsonb_path_exists 2 4]
   [:left 2 2]
   [:length 1 1]
   [:locate 2 3]
   [:lower 1 1]
   [:max 1 1]
   [:min 1 1]
   [:month 1 1]
   [:now 0 1]
   [:rand 0 1]
   [:random 0 0]
   [:regexp_replace 3 4]
   [:replace 3 3]
   [:row_number 0 0]
   [:round 1 2]
   [:setweight 2 2]
   [:split_part 3 3]
   [:statement_timestamp 0 0]
   [:sum 1 1]
   [:substring 2 3]
   [:to_regclass 1 1]
   [:to_tsquery 1 2]
   [:to_tsvector 1 2]
   [:trim 1 1]
   [:ts_rank 2 4]
   [:upper 1 1]
   [:values 1 1]
   [:year 1 1]])

(def function-names
  "The plain SQL functions Funny SQL whitelists, compiled as `f(args...)`."
  (into #{} (map first) function-arities))

(mr/def ::call.function
  "A call of a whitelisted plain SQL function, `[f & args]`, with the number of arguments that function takes."
  (into [:multi {:dispatch first}]
        (for [[f min-args max-args] function-arities]
          [f (call-schema [:= f] [:repeat (cond-> {:min min-args} max-args (assoc :max max-args)) expr])])))

(mr/def ::call.call
  "`[:call f & args]`, the Honey SQL 1 spelling of `[f & args]`."
  [:and
   (call-schema [:= :call] :keyword [:* expr])
   [:fn {:error/message "a whitelisted function call"} #(mr/validate ::expr.call (vec (rest %)))]])

(mr/def ::expr.identifier
  "A keyword: a table or column name, or a `:%f.arg` shorthand call."
  :keyword)

(mr/def ::expr.value
  "A literal value: `nil`, a boolean, a number (integers are spliced, others bound), or a [[::bound-value]]."
  [:or :nil :boolean number? ::bound-value])

(mr/def ::expr.param
  "`[:param k]`, the value the compile options bind to `k` under `:params`."
  [:tuple [:= :param] :keyword])

(mr/def ::expr.subquery
  "A [[::query]] marked `^:allow-subquery`, the only kind of map Funny SQL compiles below the top level."
  [:and
   [:fn {:error/message "a query map marked ^:allow-subquery"} #(and (map? %) (:allow-subquery (meta %)))]
   [:schema [:ref ::query]]])

(mr/def ::expr.list
  "A parenthesized list of expressions: a vector or seq not headed by a keyword, or a set."
  [:or
   [:and
    [:sequential expr]
    [:fn {:error/message "a list not headed by a keyword"} #(not (keyword? (first %)))]]
   [:set expr]])

(def ^:private call-schemas
  "The schema of each operator Funny SQL compiles."
  (merge
   {:=                       ::call.=
    :<>                      ::call.<>
    :!=                      ::call.<>
    :not=                    ::call.<>
    :and                     ::call.and
    :or                      ::call.or
    :not                     ::call.not
    :between                 ::call.between
    :case                    ::call.case
    :cast                    ::call.cast
    :composite               ::call.composite
    :current-timestamp       ::call.current-timestamp
    :date-add                ::call.date-add
    :exists                  ::call.exists
    :not-exists              ::call.not-exists
    :in                      ::call.in
    :not-in                  ::call.not-in
    :inline                  ::call.inline
    :lift                    ::call.lift
    :over                    ::call.over
    :timestampdiff           ::call.timestampdiff
    :extract                 ::call.extract
    :distinct-count          ::call.distinct-count
    :percentile-cont         ::call.percentile-cont
    :collate                 ::call.collate
    :literal                 ::call.literal
    :escape                  ::call.escape
    :position                ::call.position
    :call                    ::call.call
    honey.sql.pg-ops/atat    ::call.full-text-match}
   (zipmap [:< :<= :> :>= :like :ilike :not-like :is :is-not] (repeat ::call.comparison))
   (zipmap [:+ :- :* :/ :% :||] (repeat ::call.arithmetic))
   (zipmap function-names (repeat ::call.function))))

(mr/def ::expr.call
  "A call `[op & args]` of an operator or function Funny SQL whitelists, with the arguments it takes."
  (into [:multi {:dispatch (fn [x] (when (vector? x) (first x)))}]
        (sort-by (comp str key) call-schemas)))

(mr/def ::exprs
  "A sequence or set of expressions, such as the arguments of a function call."
  [:or [:sequential expr] [:set expr]])

(mr/def ::separated-item
  "An item Funny SQL writes in a separated run: an expression, a clause item, a CTE, a column definition or option, a
  `VALUES` row, an identifier part, or an assignment."
  [:or
   expr
   ::sequence-item
   ::table-ref
   [:schema [:ref ::cte]]
   [:schema [:ref ::column-spec]]
   [:schema [:ref ::column-option]]
   [:schema [:ref ::lock-option]]
   [:map-of ::identifier expr]
   [:tuple ::identifier expr]
   [:sequential expr]
   :string])

(mr/def ::separated-items
  "A run of [[::separated-item]]s, or assignments."
  [:or
   [:sequential ::separated-item]
   [:set ::separated-item]
   ::assignments])

(mr/def ::expr
  "An expression: an identifier, a literal value, a `[:param k]`, an `^:allow-subquery` subquery, a whitelisted call,
  or a list of expressions."
  [:multi {:dispatch (fn [x]
                       (cond
                         (keyword? x)                            :identifier
                         (map? x)                                :subquery
                         (and (vector? x) (= (first x) :param))  :param
                         (and (vector? x) (keyword? (first x)))  :call
                         (or (sequential? x) (set? x))           :list
                         :else                                   :value))}
   [:identifier ::expr.identifier]
   [:value      ::expr.value]
   [:param      ::expr.param]
   [:subquery   ::expr.subquery]
   [:call       ::expr.call]
   [:list       ::expr.list]])

(mr/def ::cte
  "A CTE: `[name subquery & options]`, where the name may be `[name {:columns [...]}]`."
  [:and
   vector?
   [:cat
    [:or ::identifier [:tuple ::identifier [:map {:closed true} [:columns {:optional true} ::identifier-list]]]]
    subquery
    [:* [:= :materialized]]]])

(mr/def ::clause.with
  "The CTEs of `WITH`."
  [:sequential ::cte])

(mr/def ::clause.with-recursive
  "The CTEs of `WITH RECURSIVE`."
  [:sequential ::cte])

(mr/def ::clause.create-table
  "The table of `CREATE TABLE`: a name, or `[name & options]`."
  [:or ::identifier [:and vector? [:cat ::identifier [:* [:= :if-not-exists]]]]])

(mr/def ::column-option-keyword
  "A column option of `:with-columns` that takes no value."
  [:enum :primary-key :generated-by-default-as-identity :auto-increment :not-null])

(mr/def ::column-option
  "A column option of `:with-columns`: a keyword, a keyword wrapped in a vector, or `[:default value]`."
  [:or
   ::column-option-keyword
   [:tuple ::column-option-keyword]
   [:tuple [:= :default] expr]])

(mr/def ::column-spec
  "A column of `CREATE TABLE`: `[name type & options]`."
  [:and vector? [:cat ::identifier ::column-type [:* ::column-option]]])

(mr/def ::clause.with-columns
  "The columns of `CREATE TABLE`."
  [:sequential ::column-spec])

(mr/def ::clause.insert-into
  "The target of `INSERT INTO`: a table, `[table columns]`, or `[[table columns?] subquery]` for `INSERT ... SELECT`."
  [:multi {:dispatch (fn [x]
                       (cond
                         (not (vector? x))      :table
                         (vector? (first x))    :select
                         :else                  :table-columns))}
   [:table         ::identifier]
   [:table-columns [:cat ::identifier [:? [:maybe ::identifier-list]]]]
   [:select        [:cat [:and vector? [:cat ::identifier [:? [:maybe ::identifier-list]]]] [:? subquery]]]])

(mr/def ::clause.merge-into
  "The table of H2's `MERGE INTO`."
  ::target-table)

(mr/def ::clause.using
  "The source of a `MERGE`: a subquery, or `[subquery alias]`."
  [:or subquery [:and vector? [:cat subquery [:? ::alias]]]])

(mr/def ::clause.on
  "The condition of a `MERGE`."
  expr)

(mr/def ::clause.when-matched-update-set
  "What a `MERGE` sets when a row matches."
  ::assignments)

(mr/def ::clause.when-not-matched-insert
  "The `[columns values]` a `MERGE` inserts when no row matches."
  [:tuple ::identifier-list [:sequential expr]])

(mr/def ::clause.columns
  "The columns of `INSERT INTO` or H2's `MERGE INTO`."
  ::identifier-list)

(mr/def ::clause.key
  "The key columns of H2's `MERGE INTO ... KEY`."
  ::identifier-list)

(mr/def ::clause.values
  "The rows of `VALUES`: maps of column to value, or lists of values matching `:columns`."
  [:multi {:dispatch #(if (map? (first %)) :maps :lists)}
   [:maps  [:sequential {:min 1} [:maybe [:map-of ::identifier expr]]]]
   [:lists [:sequential {:min 1} [:sequential expr]]]])

(mr/def ::clause.drop-table
  "The table of `DROP TABLE`: `[& options table]`."
  [:and vector? [:cat [:* [:= :if-exists]] ::identifier]])

(mr/def ::clause.update
  "The table of `UPDATE`."
  ::target-table)

(mr/def ::clause.set
  "The assignments of `SET`."
  ::assignments)

(mr/def ::clause.delete-from
  "The table of `DELETE FROM`."
  ::target-table)

(mr/def ::clause.select
  "The items of `SELECT`: one column, or a sequence of [[::select-item]]s."
  [:or ::single-item [:sequential ::select-item]])

(mr/def ::clause.select-distinct
  "The items of `SELECT DISTINCT`: one column, or a sequence of [[::select-item]]s."
  ::clause.select)

(mr/def ::clause.from
  "The sources of `FROM`: one table name, or a sequence of [[::table-ref]]s."
  [:or ::identifier [:sequential ::table-ref]])

(mr/def ::joins
  "Joins, alternating source and condition: `[source condition ...]`."
  [:maybe [:and vector? [:* [:cat ::table-ref [:and :some expr]]]]])

(mr/def ::clause.join
  "The sources and conditions of `JOIN`."
  ::joins)

(mr/def ::clause.left-join
  "The sources and conditions of `LEFT JOIN`."
  ::joins)

(mr/def ::clause.right-join
  "The sources and conditions of `RIGHT JOIN`."
  ::joins)

(mr/def ::clause.inner-join
  "The sources and conditions of `INNER JOIN`."
  ::joins)

(mr/def ::clause.where
  "The condition of `WHERE`; `nil` or `[]` for none."
  [:maybe expr])

(mr/def ::clause.group-by
  "The expressions of `GROUP BY`: one column, or a sequence of expressions."
  [:maybe [:or ::single-item [:sequential expr]]])

(mr/def ::clause.having
  "The condition of `HAVING`; `nil` or `[]` for none."
  [:maybe expr])

(mr/def ::clause.partition-by
  "The expressions of `PARTITION BY`: one column, or a sequence of expressions."
  [:maybe [:or ::single-item [:sequential expr]]])

(mr/def ::clause.union
  "The queries `UNION` combines."
  [:sequential subquery])

(mr/def ::clause.union-all
  "The queries `UNION ALL` combines."
  [:sequential subquery])

(mr/def ::clause.order-by
  "The items of `ORDER BY`: one column, or a sequence of [[::order-by-item]]s."
  [:maybe [:or ::single-item [:sequential ::order-by-item]]])

(mr/def ::clause.limit
  "A `LIMIT`: a non-negative integer, or `[:inline n]`."
  [:or nat-int? ::call.inline])

(mr/def ::clause.offset
  "An `OFFSET`: a non-negative integer, or `[:inline n]`."
  [:or nat-int? ::call.inline])

(mr/def ::lock-option
  "A row locking option of `FOR`."
  [:enum :update :skip-locked])

(mr/def ::clause.for
  "The row locking options of `FOR`."
  [:or ::lock-option [:and vector? [:sequential ::lock-option]]])

(mr/def ::clause.on-conflict
  "The conflict target of Postgres's `ON CONFLICT`, possibly empty."
  [:maybe ::identifier-list])

(mr/def ::clause.do-update-set
  "What `ON CONFLICT ... DO UPDATE SET` sets."
  ::assignments)

(mr/def ::clause.do-nothing
  "`ON CONFLICT ... DO NOTHING`, given as `true`."
  [:= true])

(mr/def ::clause.on-duplicate-key-update
  "What MySQL's `ON DUPLICATE KEY UPDATE` sets."
  ::assignments)

(mr/def ::clause.returning
  "The expressions of `RETURNING`: one column, or a sequence of expressions."
  [:or ::single-item [:sequential expr]])

(mr/def ::clause.nest
  "An expression or subquery wrapped in parentheses."
  expr)

(defn- clauses
  "The optional entries of a query map schema for the clause keys `ks`."
  [ks]
  (for [k ks]
    [k {:optional true} (keyword "metabase.funnysql.schema" (str "clause." (name k)))]))

(def ^:private select-clauses
  [:with :with-recursive :select :select-distinct :from :join :left-join :right-join :inner-join :where :group-by
   :having :partition-by :union :union-all :order-by :limit :offset :for :nest])

(mr/def ::query.select
  "A `SELECT` statement, a `UNION` of them, or a fragment of one such as a window or a lone `WHERE`."
  (into [:map {:closed true}] (clauses select-clauses)))

(mr/def ::query.insert
  "An `INSERT` statement, with Postgres's `ON CONFLICT` or MySQL's `ON DUPLICATE KEY UPDATE`."
  (into [:map {:closed true}]
        (clauses [:with :insert-into :columns :values :on-conflict :do-update-set :do-nothing :on-duplicate-key-update
                  :returning])))

(mr/def ::query.update
  "An `UPDATE` statement."
  (into [:map {:closed true}] (clauses [:with :update :set :from :join :left-join :inner-join :where :returning])))

(mr/def ::query.delete
  "A `DELETE` statement, with the `ORDER BY` and `LIMIT` MySQL accepts to delete a batch."
  (into [:map {:closed true}] (clauses [:with :delete-from :where :order-by :limit :returning])))

(mr/def ::query.merge
  "An H2 `MERGE` statement."
  (into [:map {:closed true}]
        (clauses [:merge-into :using :on :when-matched-update-set :when-not-matched-insert :key :columns :values])))

(mr/def ::query.create-table
  "A `CREATE TABLE` statement."
  (into [:map {:closed true}] (clauses [:create-table :with-columns])))

(mr/def ::query.drop-table
  "A `DROP TABLE` statement."
  (into [:map {:closed true}] (clauses [:drop-table])))

(mr/def ::query
  "A query map, dispatched on the key that names its statement."
  [:multi {:dispatch (fn [m]
                       (cond
                         (not (map? m))                 ::invalid
                         (contains? m :insert-into)     :insert
                         (contains? m :update)          :update
                         (contains? m :delete-from)     :delete
                         (contains? m :merge-into)      :merge
                         (contains? m :create-table)    :create-table
                         (contains? m :drop-table)      :drop-table
                         :else                          :select))}
   [:select       ::query.select]
   [:insert       ::query.insert]
   [:update       ::query.update]
   [:delete       ::query.delete]
   [:merge        ::query.merge]
   [:create-table ::query.create-table]
   [:drop-table   ::query.drop-table]])

(mr/def ::form
  "What [[metabase.funnysql.core/format]] compiles: a top-level [[::query]], or a single [[::expr]]."
  [:multi {:dispatch map?}
   [true  ::query]
   [false expr]])

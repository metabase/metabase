(ns metabase.funnysql.core
  "Compiles Honey SQL-shaped app-DB queries to `[sql & args]` for `:h2`, `:postgres` or `:mysql`. Closed: a clause or
  function absent from [[clause-fns]]/[[fn-call!]] throws. Values bind as `?`; only integers, booleans, validated
  tokens, [[h2x/literal]] and `[:inline <number>]` are spliced. A map compiles as a query only at top level or when marked
  `^:allow-subquery`. No support at all for `:raw`."
  (:refer-clojure :exclude [format])
  (:require
   [clojure.string :as str]
   [flatland.ordered.map :as ordered-map]
   [flatland.ordered.set :as ordered-set]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log])
  (:import
   (java.time DateTimeException ZoneId)))

(set! *warn-on-reflection* true)

(defprotocol ^:private Context
  (^:private engine [this])
  (^:private options [this])
  (^:private append-sql! [this s])
  (^:private append-arg! [this arg])
  (^:private result! [this]))

(defn- default-context [engine options]
  (let [sb   (StringBuilder.)
        args (volatile! (transient []))]
    (reify Context
      (engine      [_this]     engine)
      (options     [_this]     options)
      (append-sql! [_this s]   (.append sb s))
      (append-arg! [_this arg] (vswap! args conj! arg))
      (result!     [_this]     (into [(str sb)] (persistent! @args))))))

(defprotocol ^:private Compile
  (^:private compile! [x context]))

(defn- subquery? [x]
  (and (map? x)
       (:allow-subquery (meta x))))

(defn- fn-call? [x]
  (and (vector? x)
       (keyword? (get x 0))))

(defn- fn-call-of-type? [x k-or-k-set]
  (and (fn-call? x)
       (let [f (get x 0)]
         (if (set? k-or-k-set)
           (contains? k-or-k-set f)
           (= f k-or-k-set)))))

(defn- object! [x context]
  (append-sql! context "?")
  (append-arg! context x))

(defn- null! [_x context]
  (append-sql! context "NULL"))

(defn- boolean! [x context]
  (append-sql! context (str x)))

(defn- splice-number!
  "Write `n` into the SQL text as a numeric literal. A Ratio is written as a double, since `1/2` is not SQL."
  [n context]
  (let [s (str (cond-> n (ratio? n) double))]
    ;; don't trust `(str n)` blindly -- fail closed instead of splicing whatever it produces. This rejects
    ;; non-finite Doubles (`NaN`, `Infinity`) and guards against a hostile custom `Number` implementation whose
    ;; `toString` isn't numeric SQL syntax.
    (when-not (re-matches #"-?\d+(\.\d+)?([eE][+-]?\d+)?" s)
      (throw (ex-info "Invalid number" {:n n})))
    (append-sql! context s)))

(defn- number!
  "Splice an integer; bind anything else. Postgres and H2 type a decimal literal like `0.5` as an exact `NUMERIC`, so a
  spliced Double, Float or Ratio would come back as a `BigDecimal`, and a Float would be written as its shortest
  decimal rather than the value it holds. Bound, each keeps its type -- [[metabase.app-db.jdbc-protocols]] sets a
  Ratio as a double -- which is what Honey SQL did (#9246). Use `[:inline n]` where a non-integral number has to be a
  literal."
  [n context]
  (if (integer? n)
    (splice-number! n context)
    (object! n context)))

(defn- interpose-fn
  "Iterate all elements in `xs`. Execute `(x-fn <x>)` for each item in `xs`. Execute `(separator-fn)` in between each
  item in `xs`."
  [xs x-fn separator-fn]
  {:pre [(or (nil? xs) (coll? xs))]} ; maps are ok here, we can iterate over the pairs
  (when (seq xs)
    (loop [[x & more] xs]
      (x-fn x)
      (when (seq more)
        (separator-fn)
        (recur more)))))

(defn- ->sequence
  "Normalize a clause value that is allowed to be either a single item or a sequence of them. Honey SQL accepts
  `{:group-by :id}` as shorthand for `{:group-by [:id]}` -- likewise `:select`, `:order-by`, `:columns`, `:returning`
  and `:partition-by` -- and plenty of app-db queries rely on that, so accept it instead of blowing up on `(seq :id)`."
  [x]
  (cond
    ;; `nil` means the clause is absent, not a one-element list containing `NULL`
    (nil? x)                      nil
    (or (sequential? x) (set? x)) x
    :else                         [x]))

(defn- commas! [xs context]
  (interpose-fn xs #(compile! % context) #(append-sql! context ", ")))

(declare map!)

(defn- parens!
  "Compile `x` wrapped in parens. A `^:allow-subquery` map is compiled directly rather than via [[compile!]], which
  would parenthesize it a second time."
  [x context]
  (append-sql! context "(")
  ((if (subquery? x) map! compile!) x context)
  (append-sql! context ")"))

(defn- list! [xs context]
  (append-sql! context "(")
  (commas! xs context)
  (append-sql! context ")"))

(defn- identifier-form?
  "True if `x` is something we already know how to compile as an identifier: a keyword, or an `h2x/identifier`
  tagged form."
  [x]
  (or (keyword? x)
      (fn-call-of-type? x ::h2x/identifier)))

(defn- check-identifier-form
  "Table/column-name positions must never silently fall through to [[object!]]'s `?`-parameter handling just
  because someone passed the wrong shape of value (a string, a number, a map...) -- that produces a confusing
  runtime error from the database instead of a clear one from the compiler. Call this before compiling anything
  in one of those positions."
  [x]
  (when-not (identifier-form? x)
    (throw (ex-info "Expected an identifier" {:x x}))))

(defn- check-subquery-marked
  "In a position that only takes a query -- a CTE, `FROM`, a join, `EXISTS`, `UNION`, `INSERT INTO ... SELECT` -- a map
  not marked `^:allow-subquery` would be bound as a `?` the database can only reject, so throw instead, like `:in`
  does. Call this before compiling anything in one of those positions."
  [x]
  (when (and (map? x)
             (not (subquery? x)))
    (throw (ex-info "A subquery must be marked ^:allow-subquery" {:subquery x}))))

(declare alias!)

(defn- identifier-with-optional-alias!
  "Handle an identifier form as seen in `:select`, `:from`, etc.; unwrapped or a vector with one element will act an
  unaliased identifier while a vector with two elements will emit `<x> AS <y>`. `check-lhs`, if given, is called with
  the unaliased part before it is compiled."
  [identifier context & {:keys [check-lhs include-as?], :or {include-as? true}}]
  (let [[lhs rhs] (if (vector? identifier)
                    identifier
                    [identifier])]
    (when check-lhs
      (check-lhs lhs))
    (compile! lhs context)
    (when rhs
      ;; the alias is a name, not a value: a string here would otherwise become a `?` parameter and the database
      ;; would reject `count(*) AS ?`
      (check-identifier-form rhs)
      (append-sql! context (if include-as? " AS " " "))
      (alias! rhs context))))

(defn- identifier-list! [xs context]
  (let [xs (->sequence xs)]
    (run! check-identifier-form xs)
    (list! xs context)))

(defn- kvs-map! [kvs context]
  (letfn [(x-equals-y! [[x y]]
            (check-identifier-form x)
            (compile! x context)
            (append-sql! context " = ")
            (compile! y context))]
    (interpose-fn kvs x-equals-y! #(append-sql! context ", "))))

(defn- with! [sql ctes context]
  (append-sql! context sql)
  (letfn [(cte! [[identifier subquery & options]]
            (let [[identifier {:keys [columns]}] (if (vector? identifier)
                                                   identifier
                                                   [identifier])]
              (check-identifier-form identifier)
              (compile! identifier context)
              (when columns
                (append-sql! context \space)
                (identifier-list! columns context)))
            (append-sql! context " AS ")
            (doseq [option options]
              (case option
                :materialized (append-sql! context "MATERIALIZED ")))
            (check-subquery-marked subquery)
            (parens! subquery context))]
    (interpose-fn ctes cte! #(append-sql! context ", "))))

(defn- create-table! [identifier context]
  (let [[identifier & options] (if (vector? identifier)
                                 identifier
                                 [identifier])]
    (check-identifier-form identifier)
    (append-sql! context "CREATE TABLE ")
    (doseq [option options]
      (case option
        :if-not-exists (append-sql! context "IF NOT EXISTS ")))
    (compile! identifier context)))

(declare simple-fn!)

(defn- raw-type-name! [type-name context]
  ;; `[::h2x/raw-type-name "<type>"]` is how `h2x/cast` carries an already-validated type name through Honey SQL,
  ;; which has no other form that splices one without mangling it. Here the name is just the name, so unwrap it.
  (let [type-name     (if (and (vector? type-name)
                               (= (first type-name) ::h2x/raw-type-name))
                        (second type-name)
                        type-name)
        ;; a keyword spells the spaces in a type name as dashes, e.g. `:timestamp-with-time-zone`. A string is the name
        ;; exactly as given, where a dash can be meaningful -- ClickHouse's `DateTime64(3, 'America/Port-au-Prince')`
        keyword-name  (fn [k]
                        (str/replace (name k) #"-" " "))
        type-name-str (cond
                        ;; support annoying forms like `[:varchar 26]` -- we still want to validate these so compile
                        ;; them recursively to a string like `varchar(26)` so we can validate them
                        (vector? type-name)
                        (let [recursive-context (default-context (engine context) (options context))]
                          (simple-fn! (keyword-name (first type-name)) (rest type-name) recursive-context)
                          (first (result! recursive-context)))

                        (keyword? type-name)
                        (keyword-name type-name)

                        :else
                        (name type-name))]
    (when-not (h2x/raw-type-name? type-name-str)
      (throw (ex-info "Invalid type" {:type type-name-str})))
    (append-sql! context type-name-str)))

(defn- column-default!
  "Compile the value of a column's `DEFAULT`. DDL takes no parameters, so the value has to end up in the SQL text: a
  number is spliced even where [[number!]] would bind it, and anything that would compile to a `?` -- a string, say --
  throws rather than producing a `CREATE TABLE` the database rejects. Use [[h2x/literal]] for a string default."
  [x context]
  (if (number? x)
    (splice-number! x context)
    (let [recursive-context (default-context (engine context) (options context))
          _                 (compile! x recursive-context)
          [sql & args]      (result! recursive-context)]
      (when (seq args)
        (throw (ex-info "A column default cannot be a parameter; use h2x/literal for a string default"
                        {:default x, :args args})))
      (append-sql! context sql))))

(defn- with-columns! [column-specs context]
  (append-sql! context "(")
  (letfn [(column-identifier! [column-identifier]
            (check-identifier-form column-identifier)
            (compile! column-identifier context))
          (option! [option]
            (let [[option & args] (if (vector? option)
                                    option
                                    [option])]
              (case option
                :primary-key
                (append-sql! context "PRIMARY KEY")

                :generated-by-default-as-identity
                (append-sql! context "GENERATED BY DEFAULT AS IDENTITY")

                ;; `AUTO_INCREMENT` keeps its underscore -- it is a single keyword rather than a sequence of words
                ;; like the options above, so it is not spelled `AUTO INCREMENT`.
                :auto-increment
                (append-sql! context "AUTO_INCREMENT")

                :not-null
                (append-sql! context "NOT NULL")

                :default
                ;; check `args` for emptiness rather than truthiness of its first element -- `false` and `nil` are
                ;; both perfectly good column defaults.
                (do
                  (when-not (seq args)
                    (throw (ex-info "Missing value for :default" {})))
                  (append-sql! context "DEFAULT ")
                  (column-default! (first args) context))

                (throw (ex-info "Unknown column option" {:option option, :args args})))))
          (options! [options]
            (when (seq options)
              (append-sql! context \space)
              (interpose-fn options option! #(append-sql! context \space))))
          (column-spec! [[column-identifier type-name & options]]
            (column-identifier! column-identifier)
            (append-sql! context \space)
            (raw-type-name! type-name context)
            (options! options))]
    (interpose-fn column-specs column-spec! #(append-sql! context ", ")))
  (append-sql! context ")"))

(defn- insert-into! [x context]
  (let [[identifier subquery] (if (and (vector? x)
                                       (vector? (get x 0)))
                                x
                                [x])]
    (append-sql! context "INSERT INTO ")
    (let [[identifier columns] (if (vector? identifier)
                                 identifier
                                 [identifier])]
      (check-identifier-form identifier)
      (compile! identifier context)
      (when (seq columns)
        (append-sql! context \space)
        (identifier-list! columns context)))
    (when subquery
      (check-subquery-marked subquery)
      (append-sql! context \space)
      ;; `INSERT INTO t SELECT ...` -- the subquery is not wrapped in parens here
      ((if (subquery? subquery) map! compile!) subquery context))))

(defn- values! [rows context]
  (when-not (and (coll? rows)
                 (seq rows))
    (throw (ex-info ":values cannot have empty or nil rows" {:rows rows})))
  (if (map? (first rows))
    ;; if rows are maps, infer columns from the map keys; look at all rows to get the complete set since some maps
    ;; might be partial.
    (let [columns (into (ordered-set/ordered-set) (mapcat keys) rows)]
      (identifier-list! columns context)
      (append-sql! context " VALUES ")
      (interpose-fn rows #(list! (map (or % {}) columns) context) #(append-sql! context ", ")))
    ;; otherwise assume columns have been specified with `:columns` and assume `rows` is a sequence of sequences, one
    ;; for each row.
    (do
      (append-sql! context "VALUES ")
      (interpose-fn rows #(list! % context) #(append-sql! context ", ")))))

(defn- drop-table! [table context]
  (let [options (butlast table)
        table   (last table)]
    (append-sql! context "DROP TABLE ")
    ;; options like `IF EXISTS` have to come before the table name -- Postgres and MySQL reject
    ;; `DROP TABLE x IF EXISTS` (H2 is the only one of the three that accepts it)
    (doseq [option options]
      (case option
        :if-exists (append-sql! context "IF EXISTS ")))
    (check-identifier-form table)
    (compile! table context)))

(defn- update! [identifier context]
  (append-sql! context "UPDATE ")
  (identifier-with-optional-alias! identifier context :check-lhs check-identifier-form, :include-as? false))

(defn- set-clause! [kvs context]
  (append-sql! context "SET ")
  (kvs-map! kvs context))

(defn- delete-from! [identifier context]
  (append-sql! context "DELETE FROM ")
  (identifier-with-optional-alias! identifier context :check-lhs check-identifier-form, :include-as? false))

(defn- select! [sql cols context]
  (append-sql! context sql)
  (interpose-fn (->sequence cols) #(identifier-with-optional-alias! % context) #(append-sql! context ", ")))

(defn- from! [from context]
  (append-sql! context "FROM ")
  (if (keyword? from)
    (identifier-with-optional-alias! from context)
    (interpose-fn from
                  #(identifier-with-optional-alias! % context :check-lhs check-subquery-marked)
                  #(append-sql! context ", "))))

(defn- join!
  [join-type joins context]
  ;; `joins` alternates `<thing-to-join> <condition>`. A missing or `nil` condition -- what a `(when ...)` around one
  ;; gives you -- would otherwise compile to `ON NULL`, which the database happily runs, silently returning no rows.
  (when-not (even? (count joins))
    (throw (ex-info "Every join needs a condition: expected [<thing-to-join> <condition> ...]" {:joins joins})))
  ;; don't spit out anything if `joins` is empty
  (when (seq joins)
    (let [join-type-sql (case join-type
                          :join  "JOIN "
                          :left  "LEFT JOIN "
                          :right "RIGHT JOIN "
                          :inner "INNER JOIN ")]
      (loop [[thing-to-join condition & more] joins]
        (when (nil? condition)
          (throw (ex-info "A join condition cannot be nil" {:thing-to-join thing-to-join})))
        (append-sql! context join-type-sql)
        (identifier-with-optional-alias! thing-to-join context :check-lhs check-subquery-marked)
        (append-sql! context " ON ")
        (compile! condition context)
        (when (seq more)
          (append-sql! context \space)
          (recur more))))))

(defn- condition!
  "Compile a `WHERE`/`HAVING` condition, dropping the clause entirely when there isn't one. Honey SQL ignores a nil or
  empty clause value and callers rely on that -- the `dashboard` search spec declares `:where []` to mean \"no extra
  filter\". Emitting it anyway is not merely untidy: `[]` compiles to `()`, which H2 reads as an empty ROW
  (`Data conversion error converting \"ROW to BOOLEAN\"`), and `WHERE NULL` would silently match no rows at all.

  Only `nil` and `[]` mean \"no condition\". Dropping a `WHERE` fails open -- the query matches every row -- so any
  other empty value, like `{}`, `#{}` or `()`, is compiled like any other condition rather than silently disappearing."
  [sql condition context]
  (when-not (or (nil? condition)
                (and (vector? condition) (empty? condition)))
    (append-sql! context sql)
    (compile! condition context)))

(defn- where! [condition context]
  (condition! "WHERE " condition context))

(defn- group-by! [cols context]
  (when-let [cols (not-empty (->sequence cols))]
    (append-sql! context "GROUP BY ")
    (commas! cols context)))

(defn- having! [condition context]
  (condition! "HAVING " condition context))

(defn- partition-by! [xs context]
  (when-let [xs (not-empty (->sequence xs))]
    (append-sql! context "PARTITION BY ")
    (commas! xs context)))

(def ^:private order-by-directions
  "Each `:order-by` direction as `[<sort direction> <placement of NULLs>]`; `nil` means the default."
  {:asc              [:asc nil]
   :desc             [:desc nil]
   :nulls-last       [nil :last]
   :nulls-first      [nil :first]
   :asc-nulls-last   [:asc :last]
   :desc-nulls-last  [:desc :last]
   :asc-nulls-first  [:asc :first]
   :desc-nulls-first [:desc :first]})

(defn- mysql-order-by-subclause!
  "MySQL and MariaDB have no `NULLS FIRST`/`NULLS LAST`. They sort `NULL` below every other value -- first ascending, last
  descending -- so when that isn't the placement asked for, sort on whether `expr` is `NULL` first."
  [expr sort-direction nulls context]
  (let [sort-direction (or sort-direction :asc)]
    (when (and nulls
               (not= nulls (case sort-direction
                             :asc  :first
                             :desc :last)))
      (append-sql! context "(")
      (compile! expr context)
      (append-sql! context (case nulls
                             :last  ") IS NULL ASC, "
                             :first ") IS NULL DESC, ")))
    (compile! expr context)
    (append-sql! context (case sort-direction
                           :asc  " ASC"
                           :desc " DESC"))))

(defn- order-by! [subclauses context]
  (when-let [subclauses (not-empty (->sequence subclauses))]
    (append-sql! context "ORDER BY ")
    (letfn [(subclause! [subclause]
              (let [[expr direction :as args] (if (vector? subclause)
                                                subclause
                                                [subclause])]
                ;; Honey SQL 1 supported `[:field :asc :nulls-last]`, but in Funny SQL and Honey SQL 2 you should do
                ;; `[:field :asc-nulls-last]` instead. Interestingly enough HoneySQL doesn't error on these and just
                ;; silently ignores them 😢. Let's be nicer than that.
                (when (> (count args) 2)
                  (throw (ex-info "`:order-by` only supports [<expression> <direction>], but got more than 2 args" {:args args})))
                ;; the direction is optional, e.g. `[:field]` or `:field`, and defaults to `ASC`
                (let [[sort-direction nulls] (or (order-by-directions (or direction :asc))
                                                 (throw (ex-info "Invalid order by direction"
                                                                 {:direction direction, :subclause subclause})))]
                  (if (= (engine context) :mysql)
                    (mysql-order-by-subclause! expr sort-direction nulls context)
                    (do
                      (compile! expr context)
                      (when sort-direction
                        (append-sql! context (case sort-direction
                                               :asc  " ASC"
                                               :desc " DESC")))
                      (when nulls
                        (append-sql! context (case nulls
                                               :last  " NULLS LAST"
                                               :first " NULLS FIRST"))))))))]
      (interpose-fn subclauses subclause! #(append-sql! context ", ")))))

(defn- inline? [x]
  (fn-call-of-type? x :inline))

(defn- limit!
  [n context]
  (when-not ((some-fn nat-int? inline?) n)
    (throw (ex-info "Invalid limit" {:n n})))
  (append-sql! context "LIMIT ")
  (compile! n context))

(defn- offset!
  [n context]
  (when-not ((some-fn nat-int? inline?) n)
    (throw (ex-info "Invalid offset" {:n n})))
  (append-sql! context "OFFSET ")
  (compile! n context))

(defn- on-conflict!
  [columns context]
  (append-sql! context "ON CONFLICT ")
  (identifier-list! columns context))

(defn- do-update-set!
  [kvs context]
  (append-sql! context "DO UPDATE SET ")
  (kvs-map! kvs context))

(defn- for!
  [options context]
  (append-sql! context "FOR ")
  (let [options (if (vector? options)
                  options
                  [options])
        ;; other options like `:key-share`, `:no-key-update`, `:share`, `:nowait`, and `:of` exist, but we're not
        ;; currently using them; implement them if you need them.
        option! (fn [option]
                  (append-sql! context (case option
                                         :update      "UPDATE"
                                         :skip-locked "SKIP LOCKED")))]
    (interpose-fn options option! #(append-sql! context \space))))

(defn- returning! [cols context]
  (append-sql! context "RETURNING ")
  (commas! (->sequence cols) context))

(defn- union!
  "Compile the queries combined by a `UNION`. These are complete `SELECT`s rather than scalar subqueries, so unlike
  [[compile!]] don't wrap them in parens -- use `:nest` for that."
  [separator queries context]
  (interpose-fn queries
                (fn [query]
                  (check-subquery-marked query)
                  ((if (subquery? query) map! compile!) query context))
                #(append-sql! context separator)))

(def ^:private clause-fns
  (ordered-map/ordered-map
   :with            (partial with! "WITH ")
   :with-recursive  (partial with! "WITH RECURSIVE ")
   :create-table    create-table!
   :with-columns    with-columns!
   :insert-into     insert-into!
   :columns         identifier-list!
   :values          values!
   :drop-table      drop-table!
   :update          update!
   :set             set-clause!
   :delete-from     delete-from!
   :select          (partial select! "SELECT ")
   :select-distinct (partial select! "SELECT DISTINCT ")
   :from            from!
   :join            (partial join! :join)
   :left-join       (partial join! :left)
   :right-join      (partial join! :right)
   :inner-join      (partial join! :inner)
   :where           where!
   :group-by        group-by!
   :having          having!
   :partition-by    partition-by!
   ;; a `UNION` combines complete `SELECT`s and any trailing `ORDER BY`/`LIMIT`/`OFFSET` applies to the combined
   ;; result, so the union body has to be emitted *before* those, not after
   :union           (partial union! " UNION ")
   :union-all       (partial union! " UNION ALL ")
   :order-by        order-by!
   :limit           limit!
   :offset          offset!
   :for             for!
   :on-conflict     on-conflict!
   :do-update-set   do-update-set!
   :returning       returning!
   :nest            parens!))

(def ^:private clause-rank
  (into {}
        (map-indexed (fn [i [k _f]] [k i]))
        clause-fns))

(defn- map!
  "Compile a map. This is normally only allowed by [[format]] but not by [[compile!]] to avoid accidentally compiling
  subqueries where unintended."
  [m context]
  (interpose-fn (sort-by clause-rank (keys m))
                (fn [k]
                  (let [f (or (clause-fns k)
                              (throw (ex-info (clojure.core/format "Top-level map key %s is not currently supported" (pr-str k))
                                              {:k k})))]
                    (f (get m k) context)))
                #(append-sql! context " ")))

(defn- quoted-identifier!
  "Emit `s` as a single quoted identifier. `s` must already be validated -- it is not escaped."
  [s context]
  (let [engine     (engine context)
        quote-char (case engine
                     :mysql "`"
                     "\"")]
    (append-sql! context quote-char)
    (append-sql! context (case engine
                           :h2 (u/upper-case-en s)
                           s))
    (append-sql! context quote-char)))

(defn- identifier-part!
  "Emit a single quoted and escaped identifier part."
  [part context]
  (if (= part "*")
    (append-sql! context "*")
    (do
      (when-not (re-matches #"^[A-Za-z_][?A-Za-z0-9_-]*$" part)
        (throw (ex-info "Invalid identifier" {:identifier part})))
      (quoted-identifier! part context))))

(defn- identifier!
  "Emit a (possibly qualified) identifier composed of multiple [[identifier-part!]]s."
  [s context]
  (interpose-fn (str/split s #"\.") #(identifier-part! % context) #(append-sql! context ".")))

(defn- alias!
  "Emit the alias in `<x> AS <alias>`. An alias names a single thing, so like Honey SQL, an unqualified keyword alias is
  quoted whole rather than split on `.` into qualified parts -- `:report_card.name` is the column `\"report_card.name\"`,
  not `\"report_card\".\"name\"`, which isn't valid SQL in an alias. For the same reason a qualified keyword or a
  multi-part [[h2x/identifier]] throws rather than compiling to `AS \"a\".\"b\"`."
  [alias context]
  (cond
    (simple-keyword? alias)
    (let [s (name alias)]
      (when-not (re-matches #"^[A-Za-z_][?A-Za-z0-9_.-]*$" s)
        (throw (ex-info "Invalid alias" {:alias alias})))
      (quoted-identifier! s context))

    (or (qualified-keyword? alias)
        ;; otherwise it's `[::h2x/identifier <identifier-type> <parts>]`, since [[check-identifier-form]] ran first
        (> (count (get alias 2)) 1))
    (throw (ex-info "Invalid alias: an alias cannot be qualified" {:alias alias}))

    :else
    (compile! alias context)))

(defn- keyword!
  "Compile a keyword as a quoted and escaped identifier."
  [k context]
  ;; the `%` shorthand can carry a `/` (`:%lower.metabase_field/name`), so match against the keyword's whole printed
  ;; form rather than just its name
  (let [s (if-let [kw-ns (namespace k)]
            (str kw-ns "/" (name k))
            (name k))]
    (cond
      ;; function keyword e.g. `:%now`, `:%count.*`, or `:%lower.metabase_field/name`. This has to come before the
      ;; qualified-keyword case: `:%lower.metabase_field/name` *is* a qualified keyword -- its namespace is
      ;; `%lower.metabase_field` -- but it means `lower(metabase_field.name)`, not an identifier. `.` separates the
      ;; function name from its arguments, and a `/` within an argument qualifies it as `table.column`.
      (str/starts-with? s "%")
      (let [[f & args] (str/split (subs s 1) #"\.")]
        (compile! (into [(keyword f)] (map keyword) args) context))

      (qualified-keyword? k)
      (do
        (identifier! (namespace k) context)
        (append-sql! context ".")
        (identifier! (name k) context))

      :else
      (identifier! (name k) context))))

(def ^:private predicate-operators
  "Operators that compile to a bare SQL predicate -- `x IS NULL`, `a AND b`, `x IN (...)`, `x < 1`. Used as the operand
  of a comparison these have to be parenthesized; everything else ([[simple-fn!]] calls, `:cast`, the `h2x/` forms,
  arithmetic) either brings its own delimiters or binds tighter than a comparison already, and wrapping those would
  just add noise."
  #{:!=
    :<
    :<=
    :<>
    :=
    :>
    :>=
    :and
    :between
    :escape
    :exists
    :ilike
    :in
    :is
    :is-not
    :like
    :not
    :not-exists
    :not-in
    :not-like
    :not=
    :or
    :metabase.funnysql.core/postgres-full-text-search-match})

(defn- unwrap-h2x-typed
  "`x` without its `::h2x/typed` wrappers, if any. `h2x/+` and friends wrap their result in one when an argument carries
  database type info, and it compiles to just the form it wraps, so look through it to see what that form is."
  [x]
  (if (fn-call-of-type? x ::h2x/typed)
    (recur (get x 1))
    x))

(defn- predicate-call?
  "Whether `x` is a [[fn-call?]] for one of the [[predicate-operators]]."
  [x]
  (fn-call-of-type? (unwrap-h2x-typed x) predicate-operators))

(def ^:private infix-operators
  (into predicate-operators #{:+ :- :/ :* :% :||}))

(defn- infix-call?
  "Whether `x` compiles to a bare infix expression -- a [[predicate-call?]], arithmetic, or `||` -- which needs parens
  as the operand of another infix operator: `[:* [:+ :x 1] 2]` is `(x + 1) * 2`, not `x + 1 * 2`. `:escape` is the
  exception. It is the postfix `ESCAPE` of the `LIKE` pattern it is the operand of, and `x LIKE (? ESCAPE '!')` is not
  valid SQL."
  [x]
  (let [x (unwrap-h2x-typed x)]
    (and (fn-call? x)
         (not (fn-call-of-type? x :escape))
         (fn-call-of-type? x infix-operators))))

(defn- infix-operand!
  "Compile `x` as the operand of an infix operator like `*`, `IS`, `BETWEEN` or `IN`, parenthesized if it is an
  [[infix-call?]]."
  [x context]
  ((if (infix-call? x) parens! compile!) x context))

(defn- equals! [sql nil-sql [x y :as args] context]
  (when-not (= (count args) 2)
    (throw (ex-info "Wrong number of args to :=/:!=/:<>/:not= (expected 2 args)" {:args args})))
  ;; A `nil` on *either* side becomes `IS [NOT] NULL` against whichever side is non-`nil`, matching Honey SQL's
  ;; `:transform-null-equals`. This has to cover `[:= nil x]` as well as `[:= x nil]`: compiling the `nil` as a plain
  ;; operand would give `NULL = x`, which evaluates to `NULL` rather than `TRUE` and so silently matches no rows.
  ;; `[:= nil nil]` keeps a literal `NULL` on the left, giving `NULL IS NULL`.
  (letfn [(operand! [v]
            ;; make sure if the operand is itself something like `[:= x nil]` we get `(x IS NULL) = <y>` instead of
            ;; the unparsable `x IS NULL = y`. (A scalar subquery gets the same treatment, but [[compile!]] already
            ;; parenthesizes those.)
            ((if (predicate-call? v) parens! compile!) v context))]
    (if (or (nil? x) (nil? y))
      (do
        (operand! (if (nil? x) y x))
        (append-sql! context nil-sql))
      (do
        (operand! x)
        (append-sql! context sql)
        (operand! y)))))

(defn- compound!
  "Compile a compound boolean expression like `:and` or `:or`. Like Honey SQL we ignore `nil` args -- this is what makes
  `[:and x (when y z)]` work -- and if nothing is left we compile `identity-value` (`TRUE` for AND, `FALSE` for OR)
  rather than emitting nothing at all."
  [sql identity-value xs context]
  (let [xs (filter some? xs)]
    (condp = (count xs)
      0 (compile! identity-value context)
      1 (compile! (first xs) context)
      (interpose-fn xs #(parens! % context) #(append-sql! context sql)))))

(defn- not! [[x] context]
  (append-sql! context "NOT ")
  (parens! x context))

(defn- param-value
  "The value `context`'s options bind to `k`, for a `[:param k]` form. Throws if param named by `k` is missing from
  `:params` in the options map."
  [k context]
  {:pre [(keyword? k)]}
  ;; look the key up with a sentinel rather than testing the value for truthiness -- `false` and `nil` are both
  ;; legitimate parameter values.
  (let [v (get-in (options context) [:params k] ::not-found)]
    (when (= v ::not-found)
      (throw (ex-info "Missing value for :param" {:param k})))
    v))

(defn- lift-value [x]
  (cond
    ((some-fn fn-call? keyword?) x)
    [:lift x]

    ((some-fn sequential? set?) x)
    (into (empty x) (map lift-value) x)

    :else
    x))

(defn- in-values
  "The values side of an `:in`/`:not-in` form, with a `[:param k]` naming a collection resolved to
  that collection.

  `IN` takes a list of values rather than one value, so a collection bound to a param has to expand
  into `(?, ?)`. Compiled as an ordinary param it emits a single `?` and binds the whole collection,
  which no database accepts -- and an empty one would slip past the rewrite below and emit `IN ()`.
  Honey SQL expands a collection-valued param in this position the same way.

  A param naming anything else is left alone, and compiles to a single `?` as it would in any other
  value slot. A scalar is not a list of values, and a map must stay one bound value rather than
  become a list of its entries -- `metabase.app-db.honeysql-guard` is what refuses an unmarked one."
  [vs context]
  (if (fn-call-of-type? vs :param)
    (let [v (lift-value (param-value (second vs) context))]
      (if (or (sequential? v) (set? v))
        v
        vs))
    vs))

(defn- in! [f [lhs vs] context]
  (let [vs (in-values vs context)]
    (when-not (or (empty? vs)
                  (sequential? vs)
                  (set? vs)
                  (subquery? vs))
      (throw (ex-info "Invalid sequence of values (maps must be marked with ^:allow-subquery)" {:vs vs})))
    (if (empty? vs)
      (compile! (case f
                  :in     false
                  :not-in true)
                context)
      ;; non-empty values
      (do
        (infix-operand! lhs context)
        (append-sql! context (case f
                               :in     " IN "
                               :not-in " NOT IN "))
        (cond
          (subquery? vs)
          (compile! vs context)

          ;; sequence of sequences
          (and (sequential? (first vs))
               (not (fn-call? (first vs))))
          (do
            (append-sql! context "(")
            (interpose-fn vs #(list! % context) #(append-sql! context ", "))
            (append-sql! context ")"))

          ;; Handle nonsense like`[:in :field [:inline [3]]]`
          (fn-call? vs)
          (compile! vs context)

          :else
          (list! vs context))))))

(defn- between! [[x y z] context]
  (infix-operand! x context)
  (append-sql! context " BETWEEN ")
  (infix-operand! y context)
  (append-sql! context " AND ")
  (infix-operand! z context))

(defn- cast! [[x type-name] context]
  (append-sql! context "CAST(")
  (compile! x context)
  (append-sql! context " AS ")
  (raw-type-name! type-name context)
  (append-sql! context ")"))

(defn- case! [args context]
  (append-sql! context "CASE ")
  (loop [[condition expr & more] args]
    (if-not (= condition :else)
      (do
        (append-sql! context "WHEN ")
        (compile! condition context)
        (append-sql! context " THEN ")
        (compile! expr context))
      (do
        (append-sql! context "ELSE ")
        (compile! expr context)))
    (when (seq more)
      (append-sql! context \space)
      (recur more)))
  (append-sql! context " END"))

(defn- exists! [sql subquery context]
  (check-subquery-marked subquery)
  (append-sql! context sql)
  (compile! subquery context))

(defn- inline! [x context]
  (letfn [(inlineable-atomic-value? [x]
            ((some-fn nil? number? boolean?) x))
          ;; splice numbers directly rather than via [[compile!]], since [[number!]] binds non-integral ones
          (inline-atomic-value! [x]
            ((if (number? x) splice-number! compile!) x context))]
    (cond
      (inlineable-atomic-value? x)
      (inline-atomic-value! x)

      (and ((some-fn sequential? set?) x)
           (every? inlineable-atomic-value? x))
      (do
        (append-sql! context "(")
        (interpose-fn x inline-atomic-value! #(append-sql! context ", "))
        (append-sql! context ")"))

      :else
      (do
        ;; TODO (Cam 2026-10-01) Make this an actual error instead of just a warning
        (log/warnf ":inline is only allowed for numbers, booleans and nil, got: %s" (pr-str x))
        (compile! x context)))))

(defn- check-valid-unit [unit]
  (when-not (and ((some-fn keyword? string?) unit)
                 (re-matches #"^[a-zA-Z0-9]+$" (name unit)))
    (throw (ex-info "Invalid unit" {:unit unit}))))

(defn- timestamp-diff! [[unit col-x col-y] context]
  (check-valid-unit unit)
  (append-sql! context "timestampdiff(")
  (append-sql! context (name unit))
  (append-sql! context ", ")
  (compile! col-x context)
  (append-sql! context ", ")
  (compile! col-y context)
  (append-sql! context ")"))

(defn- current-timestamp! [context]
  (append-sql! context "current_timestamp"))

(defn- over! [[expr m & more :as args] context]
  ;; Honey SQL also accepts an alias inside the `:over` form, `[:over [expr window alias]]`. Don't silently drop it --
  ;; the query would fail later with a confusing `column "alias" does not exist`.
  (when (seq more)
    (throw (ex-info (str "`:over` only supports [<expression> <window>]; put the alias outside instead, e.g. "
                         "[[:over [<expression> <window>]] <alias>]")
                    {:args args})))
  ;; likewise don't silently drop anything else in the window -- [[map!]] would happily compile e.g. a `:where`, so
  ;; anything other than `:partition-by` and `:order-by` has to be rejected up front
  (let [unsupported-keys (remove #{:order-by :partition-by} (keys m))]
    (when (seq unsupported-keys)
      (throw (ex-info "`:over` only supports :partition-by and :order-by in the window"
                      {:window m, :unsupported-keys (vec unsupported-keys)}))))
  (compile! expr context)
  (append-sql! context " OVER (")
  (when (seq m)
    (map! m context))
  (append-sql! context ")"))

(defn- param! [k context]
  (object! (param-value k context) context))

(defn- unary-binary-operator! [f x context]
  (case f
    :+ (compile! x context)
    :- (if (number? x)
         (compile! (-' x) context)
         (do
           (append-sql! context "-")
           ;; always parenthesize the operand: written bare, one that compiles to a negative number would give `--1`,
           ;; which starts a SQL comment
           (parens! x context)))))

(defn- binary-operator! [f args context]
  (if (= (count args) 1)
    (unary-binary-operator! f (first args) context)
    (let [f-str (case f
                  :like     " LIKE "
                  :ilike    " ILIKE "
                  :not-like " NOT LIKE "
                  :is       " IS "
                  :is-not   " IS NOT "
                  (str \space (name f) \space))]
      (interpose-fn args #(infix-operand! % context) #(append-sql! context f-str)))))

(defn- simple-fn! [f args context]
  (let [f (name f)]
    (append-sql! context f))
  (list! args context))

(defn- h2x-identifier! [[_identifier-type parts] context]
  (interpose-fn parts #(identifier-part! % context) #(append-sql! context ".")))

(defn- h2x-literal! [s context]
  ;; only double backslashes on engines that actually treat `\` as an escape character inside a plain `'...'`
  ;; literal. MySQL always does, unless the session's `NO_BACKSLASH_ESCAPES` sql_mode is set (see
  ;; [[metabase.driver.mysql/utf8-string-literal]]'s docstring for the same caveat). Postgres and H2 do *not*, as long
  ;; as `standard_conforming_strings` is on (the default) -- doubling backslashes there would corrupt a value that
  ;; legitimately contains one instead of protecting it. See [[metabase.driver.sql.util/escape-sql]], which documents
  ;; this exact per-engine distinction (`:ansi` vs `:backslashes` vs `:ansi+backslashes`) and warns against relying on
  ;; any of these styles to sanitize untrusted input in the first place.
  (let [s (as-> s s
            (u/qualified-name s)
            (cond-> s
              (= (engine context) :mysql) (str/replace "\\" "\\\\"))
            (str/replace s "'" "''"))]
    (append-sql! context "'")
    (append-sql! context s)
    (append-sql! context "'")))

(defn- h2x-extract! [[unit expr] context]
  (check-valid-unit unit)
  (append-sql! context "extract(")
  (append-sql! context (name unit))
  (append-sql! context " FROM ")
  (compile! expr context)
  (append-sql! context ")"))

(defn- h2x-distinct-count! [expr context]
  (append-sql! context "count(DISTINCT ")
  (compile! expr context)
  (append-sql! context ")"))

(defn- h2x-percentile-cont! [[expr fraction] context]
  (when-not (number? fraction)
    (throw (ex-info "Invalid continuous percentile fraction" {:fraction fraction})))
  (append-sql! context "percentile_cont(")
  ;; splice the fraction as a literal, which [[number!]] would otherwise bind as a parameter
  (splice-number! fraction context)
  (append-sql! context ") WITHIN GROUP (ORDER BY ")
  (compile! expr context)
  (append-sql! context ")"))

(defn- h2x-collate! [[expr collation] context]
  (when-not (re-matches #"^\w+$" (name collation))
    (throw (ex-info "Invalid collation" {:collation collation})))
  (compile! expr context)
  (append-sql! context " COLLATE ")
  (append-sql! context (name collation)))

(defn- h2x-at-time-zone! [[expr zone] context]
  ;; `ZoneId/of` only accepts a known region like `America/New_York` or `Etc/GMT+5`, or an offset like `+05:00`, so
  ;; its ID can't contain a `'` and is safe to splice into the literal below
  (let [^ZoneId zone-id (try
                          (ZoneId/of (name zone))
                          (catch DateTimeException e
                            (throw (ex-info "Invalid time zone" {:time-zone zone} e))))]
    (append-sql! context "(")
    (compile! expr context)
    (append-sql! context " AT TIME ZONE '")
    (append-sql! context (.getId zone-id))
    (append-sql! context "')")))

(defn- h2x-interval! [engine [amount unit] context]
  (when-not (number? amount)
    (throw (ex-info "Invalid amount" {:amount amount})))
  (when-not (#{:millisecond :second :minute :hour :day :week :month :year} unit)
    (throw (ex-info "Invalid unit" {:unit unit})))
  (append-sql! context (case engine
                         :postgres "INTERVAL '"
                         :mysql "INTERVAL "))
  ;; always splice the amount: a non-integral one would otherwise be bound, and on Postgres the `?` would land inside
  ;; the quoted literal, where JDBC ignores it
  (splice-number! amount context)
  (append-sql! context " ")
  (append-sql! context (name unit))
  (when (= engine :postgres)
    (append-sql! context "'")))

(defn- escape! [[pattern escape-chars] context]
  ;; `ESCAPE` is a postfix operator on a `LIKE` pattern (`... LIKE ? ESCAPE '!'`), not a function call -- compiling it
  ;; as `escape(?, '!')` produces a `Function "ESCAPE" not found` error from the database.
  (compile! pattern context)
  (append-sql! context " ESCAPE ")
  (compile! escape-chars context))

(defn- position!
  "`[:position <substring> <string>]` compiles to `position(<substring> IN <string>)`, the 1-based index of the first
  occurrence of `substring` in `string`, or `0` if there isn't one. H2, Postgres and MySQL all accept this standard
  form, but Postgres rejects the comma form `position(<substring>, <string>)` that Honey SQL emits."
  [[substring s :as args] context]
  (when-not (= (count args) 2)
    (throw (ex-info "Wrong number of args to :position (expected 2 args)" {:args args})))
  (append-sql! context "position(")
  (infix-operand! substring context)
  (append-sql! context " IN ")
  (infix-operand! s context)
  (append-sql! context ")"))

(defn- postgres-full-text-search-match [[lhs rhs] context]
  (check-identifier-form lhs)
  (check-identifier-form rhs)
  (compile! lhs context)
  (append-sql! context " @@ ")
  (compile! rhs context))

(defn- fn-call! [[f & args] context]
  {:pre [(keyword? f)]}
  ;; This `case` has no default behavior for an unknown function on purpose: `f` can come from an attacker-derived
  ;; `:%foo` keyword (see `keyword!`), so an unrecognized function name must throw instead of being spliced into the
  ;; SQL raw. All allowed functions need to be explicitly whitelisted here.
  ;;
  ;; ⚠⚠⚠ DO NOT ADD SUPPORT FOR `:raw` -- IT IS NOT SUPPORTED ON PURPOSE ⚠⚠⚠
  ;;
  (case f
    (:<> :!= :not=)    (equals! " <> " " IS NOT NULL" args context)
    :=                 (equals! " = " " IS NULL" args context)
    :and               (compound! " AND " true args context)
    :between           (between! args context)
    :case              (case! args context)
    :cast              (cast! args context)
    :composite         (list! args context)
    :current-timestamp (current-timestamp! context)
    :escape            (escape! args context)
    :exists            (exists! "EXISTS " (first args) context)
    :in                (in! f args context)
    :inline            (inline! (first args) context)
    :lift              (object! (first args) context)
    :not               (not! args context)
    :not-exists        (exists! "NOT EXISTS " (first args) context)
    :not-in            (in! f args context)
    :or                (compound! " OR " false args context)
    :over              (over! (first args) context)
    :param             (param! (first args) context)
    :position          (position! args context)
    :timestampdiff     (timestamp-diff! args context)

    (:< :<= :> :>= :like :ilike :not-like :+ :- :/ :* :% :|| :is :is-not)
    (binary-operator! f args context)

    ;; `:call` exists for Honey SQL 1 compatibility e.g. `[:call f & args]`, equivalent to `[f & args]`
    :call
    (recur args context)

    ;; custom legacy `h2x/` operators
    ::h2x/identifier        (h2x-identifier! args context)
    ::h2x/literal           (h2x-literal! (first args) context)
    ::h2x/extract           (h2x-extract! args context)
    ::h2x/timestampdiff     (timestamp-diff! args context)
    ::h2x/distinct-count    (h2x-distinct-count! (first args) context)
    ::h2x/percentile-cont   (h2x-percentile-cont! args context)
    ::h2x/collate           (h2x-collate! args context)
    ::h2x/at-time-zone      (h2x-at-time-zone! args context)
    ::h2x/typed             (compile! (first args) context)
    ::h2x/raw-type-name     (raw-type-name! (first args) context)
    ::h2x/postgres-interval (h2x-interval! :postgres args context)
    ::h2x/mysql-interval    (h2x-interval! :mysql args context)

    ;; other custom operators
    :metabase.funnysql.core/postgres-full-text-search-match
    (postgres-full-text-search-match args context)

    (:abs
     :avg
     :ceil
     :coalesce
     :concat
     :concat_ws
     :count
     :current_database
     :current_schema
     :database
     :date_part
     :dateadd
     :date_add
     :datediff
     :day
     :distinct
     :floor
     :greatest
     :least
     :isnull
     :json_contains_path
     :json_search
     :jsonb_build_object
     :jsonb_path_exists
     :left
     :length
     :locate
     :lower
     :max
     :min
     :month
     :now
     :rand
     :random
     :regexp_replace
     :replace
     :row_number
     :round
     :setweight
     :split_part
     :sum
     :substring
     :to_regclass
     :to_tsquery
     :to_tsvector
     :trim
     :ts_rank
     :upper
     :year)
    (simple-fn! f args context)

    #_else
    (throw (ex-info (clojure.core/format "Function %s is not currently supported; add it to metabase.funnysql.core/fn-call! if it should be"
                                         (pr-str f))
                    {:f f, :args args}))))

(defn- sequence! [xs context]
  (cond
    (fn-call? xs)
    (fn-call! xs context)

    ;; a function call has to be a vector. Compiled as a list of values, a seq like `(cons :or clauses)` gives
    ;; `("or", ...)`, which the database only rejects later with a misleading `Column "OR" not found`
    (and (sequential? xs)
         (keyword? (first xs)))
    (throw (ex-info "A function call must be a vector, not a seq" {:form xs}))

    :else
    (list! xs context)))

(extend-protocol Compile
  Object                      (compile! [this context] (object! this context))
  nil                         (compile! [this context] (null! this context))
  Boolean                     (compile! [this context] (boolean! this context))
  Number                      (compile! [this context] (number! this context))
  clojure.lang.Keyword        (compile! [this context] (keyword! this context))
  ;; a `^:allow-subquery` map compiled anywhere other than the top level is a subquery -- a scalar subquery in a
  ;; `SELECT` list or function argument, a derived table in `FROM`, etc. -- all of which need to be parenthesized.
  clojure.lang.IPersistentMap (compile! [this context] ((if (:allow-subquery (meta this))
                                                          parens!
                                                          object!) this context))
  clojure.lang.IPersistentSet (compile! [this context] (sequence! this context))
  clojure.lang.Sequential     (compile! [this context] (sequence! this context)))

(defn format
  "Compile `honeysql-form` (either a top-level map or an individual clause) to SQL for `engine`.

  Returns the standard `[sql & args]` shape if able to compile successfully; throws an exception on unsupported or
  invalid forms."
  ([honeysql-form engine]
   (format honeysql-form engine nil))
  ([honeysql-form engine options]
   {:pre [(#{:postgres :h2 :mysql} engine)]}
   (try
     (let [context (default-context engine options)]
       ;; [[compile!]] doesn't support compiling maps recursively unless marked `^:allow-subquery`
       ((if (map? honeysql-form) map! compile!) honeysql-form context)
       (result! context))
     (catch Exception e
       (throw (ex-info (str "Error compiling Honey SQL: " (ex-message e))
                       {:form honeysql-form, :engine engine, :options options}
                       e))))))

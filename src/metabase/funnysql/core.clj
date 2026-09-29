(ns metabase.funnysql.core
  (:refer-clojure :exclude [format])
  (:require
   [clojure.string :as str]
   [flatland.ordered.map :as ordered-map]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defprotocol ^:private Context
  (^:private append-sql! [this s])
  (^:private append-arg! [this arg])
  (^:private engine [this])
  (^:private result! [this]))

(defprotocol ^:private Compile
  (^:private compile! [x context]))

(defn- object! [x context]
  (append-sql! context "?")
  (append-arg! context x))

(defn- null! [_x context]
  (append-sql! context "NULL"))

(defn- boolean! [x context]
  (append-sql! context (str x)))

(defn- number! [n context]
  (if (instance? clojure.lang.Ratio n)
    (recur (double n) context)
    (let [s (str n)]
      ;; don't trust `(str n)` blindly -- fail closed instead of splicing whatever it produces. This rejects
      ;; non-finite Doubles (`NaN`, `Infinity`) and guards against a hostile custom `Number` implementation whose
      ;; `toString` isn't numeric SQL syntax.
      (when-not (re-matches #"-?\d+(\.\d+)?([eE][+-]?\d+)?" s)
        (throw (ex-info "Invalid number" {:n n})))
      (append-sql! context s))))

(defn- interpose-fn
  "Iterate all elements in `xs`. Execute `(x-fn <x>)` for each item in `xs`. Execute `(separator-fn)` in between each
  item in `xs`."
  [xs x-fn separator-fn]
  (when xs
    (assert ((some-fn sequential? set?) xs))
    (when (seq xs)
      (loop [[x & more] xs]
        (x-fn x)
        (when (seq more)
          (separator-fn)
          (recur more))))))

(defn- -interpose!
  "Compile all the forms in `xs` and interpose the `separator` string between them."
  [separator xs context]
  (interpose-fn xs #(compile! % context) #(append-sql! context separator)))

(defn- -commas! [xs context]
  (-interpose! ", " xs context))

(defn- -parens! [x context]
  (append-sql! context "(")
  (compile! x context)
  (append-sql! context ")"))

(defn- -list! [xs context]
  (append-sql! context "(")
  (-commas! xs context)
  (append-sql! context ")"))

(defn- -identifier-with-optional-as!
  "Handle an identifier form as seen in `:select`, `:from`, etc.; unwrapped or a vector with one element will act an
  unaliased identifier while a vector with two elements will emit `<x> AS <y>`."
  [identifier context]
  (let [[lhs rhs] (if (vector? identifier)
                    identifier
                    [identifier])]
    (compile! lhs context)
    (when rhs
      (append-sql! context " AS ")
      (compile! rhs context))))

(defn- identifier-form?
  "True if `x` is something we already know how to compile as an identifier: a keyword, or an `h2x/identifier`
  tagged form."
  [x]
  (or (keyword? x)
      (and (vector? x)
           (= (first x) :metabase.util.honey-sql-2/identifier))))

(defn- -require-identifier!
  "Table/column-name positions must never silently fall through to [[object!]]'s `?`-parameter handling just
  because someone passed the wrong shape of value (a string, a number, a map...) -- that produces a confusing
  runtime error from the database instead of a clear one from the compiler. Call this before compiling anything
  in one of those positions."
  [x]
  (when-not (identifier-form? x)
    (throw (ex-info "Expected an identifier" {:x x}))))

(defn- -identifier-list! [xs context]
  (run! -require-identifier! xs)
  (-list! xs context))

(defn- -kvs-map! [kvs context]
  (letfn [(-x-equals-y! [[x y]]
            (-require-identifier! x)
            (compile! x context)
            (append-sql! context " = ")
            (compile! y context))]
    (interpose-fn kvs -x-equals-y! #(append-sql! context ", "))))

(defn- unwrap-identifier [identifier]
  (if (vector? identifier)
    (recur (first identifier))
    identifier))

(declare map!)

(defn- with! [sql ctes context]
  (append-sql! context sql)
  (letfn [(-cte [[identifier subquery]]
            (-require-identifier! identifier)
            (compile! identifier context)
            (append-sql! context " AS (")
            (map! subquery context)
            (append-sql! context ")"))]
    (interpose-fn ctes -cte #(append-sql! context ", "))))

(defn- insert-into! [identifier context]
  (append-sql! context "INSERT INTO ")
  (let [identifier (unwrap-identifier identifier)]
    (-require-identifier! identifier)
    (compile! identifier context)))

(defn- values! [rows context]
  (let [columns (keys (first rows))]
    (-identifier-list! columns context))
  (append-sql! context " VALUES ")
  (interpose-fn rows #(-list! (vals %) context) #(append-sql! context ", ")))

(defn- update! [identifier context]
  (append-sql! context "UPDATE ")
  (let [identifier (unwrap-identifier identifier)]
    (-require-identifier! identifier)
    (compile! identifier context)))

(defn- set! [kvs context]
  (append-sql! context "SET ")
  (-kvs-map! kvs context))

(defn- delete-from! [identifier context]
  (append-sql! context "DELETE FROM ")
  (let [identifier (unwrap-identifier identifier)]
    (-require-identifier! identifier)
    (compile! identifier context)))

(defn- select! [sql cols context]
  (if-not (sequential? cols)
    ;; TODO -- we shouldn't allow this, but the hairball search query does `:select :id` at some point
    (recur sql [cols] context)
    (do
      (append-sql! context sql)
      (interpose-fn cols #(-identifier-with-optional-as! % context) #(append-sql! context ", ")))))

(defn- from! [from context]
  (append-sql! context "FROM ")
  (if (keyword? from)
    (-identifier-with-optional-as! from context)
    (interpose-fn from #(-identifier-with-optional-as! % context) #(append-sql! context ", "))))

(defn- join!
  [join-type joins context]
  (let [join-type-sql (case join-type
                        :join  "JOIN "
                        :left  "LEFT JOIN "
                        :right "RIGHT JOIN "
                        :inner "INNER JOIN ")]
    (loop [[thing-to-join condition & more] joins]
      (append-sql! context join-type-sql)
      ;; TODO -- handle subqueries?
      (-identifier-with-optional-as! thing-to-join context)
      (append-sql! context " ON ")
      (compile! condition context)
      (when (seq more)
        (append-sql! context \space)
        (recur more)))))

(defn- where! [condition context]
  (append-sql! context "WHERE ")
  (compile! condition context))

(defn- group-by! [cols context]
  (append-sql! context "GROUP BY ")
  (interpose-fn cols #(compile! % context) #(append-sql! context ", ")))

(defn- having! [condition context]
  (append-sql! context "HAVING ")
  (compile! condition context))

(defn- order-by! [subclauses context]
  (append-sql! context "ORDER BY ")
  (letfn [(subclause! [subclause]
            (let [[expr direction] (if (vector? subclause)
                                     subclause
                                     [subclause :asc])]
              (compile! expr context)
              (append-sql! context (case direction
                                     :asc " ASC"
                                     :desc " DESC"))))]
    (interpose-fn subclauses subclause! #(append-sql! context ", "))))

(defn- limit!
  [n context]
  (when-not (nat-int? n)
    (throw (ex-info "Invalid limit" {:n n})))
  (append-sql! context "LIMIT ")
  (compile! n context))

(defn- offset!
  [n context]
  (when-not (nat-int? n)
    (throw (ex-info "Invalid offset" {:n n})))
  (append-sql! context "OFFSET ")
  (compile! n context))

(defn- for!
  [what context]
  (append-sql! context "FOR ")
  (append-sql! context (case what
                         :update "UPDATE")))

(defn- on-conflict!
  [columns context]
  (append-sql! context "ON CONFLICT ")
  (-identifier-list! columns context))

(defn- do-update-set!
  [kvs context]
  (append-sql! context "DO UPDATE SET ")
  (-kvs-map! kvs context))

(defn- returning! [cols context]
  (append-sql! context "RETURNING ")
  (-commas! cols context))

(defn- union! [sql subqueries context]
  (interpose-fn subqueries #(map! % context) #(append-sql! context sql)))

(def ^:private clause-fns
  (ordered-map/ordered-map
   :with            (partial with! "WITH ")
   :with-recursive  (partial with! "WITH RECURSIVE ")
   :insert-into     insert-into!
   :values          values!
   :update          update!
   :set             set!
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
   :order-by        order-by!
   :limit           limit!
   :offset          offset!
   :for             for!
   :on-conflict     on-conflict!
   :do-update-set   do-update-set!
   :returning       returning!
   :union           (partial union! " UNION ")
   :union-all       (partial union! " UNION ALL ")))

(def ^:private clause-rank
  (into {}
        (map-indexed (fn [i [k _f]] [k i]))
        clause-fns))

(defn- map!
  "Compile a map. This is normally only allowed by [[compile]] but not by [[compile!]] to avoid accidentally compiling
  subqueries where unintended."
  [m context]
  (interpose-fn (sort-by clause-rank (keys m))
                (fn [k] ((clause-fns k) (get m k) context))
                #(append-sql! context " ")))

(defn- -identifier-part!
  "Emit a single quoted and escaped identifier part."
  [part context]
  (if (= part "*")
    (append-sql! context "*")
    (do
      (when-not (re-matches #"^[A-Za-z_][A-Za-z0-9_-]*$" part)
        (throw (ex-info "Invalid identifier" {:identifier part})))
      (let [engine     (engine context)
            quote-char (case engine
                         :mysql "`"
                         "\"")]
        (append-sql! context quote-char)
        (append-sql! context (case engine
                               :h2 (u/upper-case-en part)
                               part))
        (append-sql! context quote-char)))))

(defn -identifier!
  "Emit a (possibly qualified) identifier composed of multiple [[-identifier-part]]s."
  [s context]
  (interpose-fn (str/split s #"\.") #(-identifier-part! % context) #(append-sql! context ".")))

(defn- keyword!
  "Compile a keyword as a quoted and escaped identifier."
  [k context]
  (cond
    (qualified-keyword? k)
    (do
      (-identifier! (namespace k) context)
      (append-sql! context ".")
      (-identifier! (name k) context))

    ;; function keyword e.g. `:%now` or `%count.*`
    (and (simple-keyword? k)
         (str/starts-with? (name k) "%"))
    (let [[f & args] (str/split (name k) #"\.")
          f          (subs f 1)]
      (compile! (into [(keyword f)] (map keyword) args) context))

    :else
    (-identifier! (name k) context)))

(defn- -equals! [sql nil-sql [x y] context]
  (compile! x context)
  (if (some? y)
    (do
      (append-sql! context sql)
      (compile! y context))
    (append-sql! context nil-sql)))

(defn- -compound! [sql xs context]
  (interpose-fn xs #(-parens! % context) #(append-sql! context sql)))

(defn- not! [[x] context]
  (append-sql! context "NOT ")
  (-parens! x context))

(defn- -in! [f [lhs vs] context]
  (when-not (or (sequential? vs)
                (set? vs)
                (and (map? vs)
                     (:allow-subquery (meta vs))))
    (throw (ex-info "Invalid sequence of values (maps must be marked with ^:allow-subquery)" {:vs vs})))
  (if (empty? vs)
    (compile! (case f
                :in     false
                :not-in true)
              context)
    (do
      (compile! lhs context)
      (append-sql! context (case f
                             :in     " IN "
                             :not-in " NOT IN "))
      (if (map? vs)
        (do
          (append-sql! context "(")
          (map! vs context)
          (append-sql! context ")"))
        (-list! vs context)))))

(defn- between! [[x y z] context]
  (compile! x context)
  (append-sql! context " BETWEEN ")
  (compile! y context)
  (append-sql! context " AND ")
  (compile! z context))

(defn- cast! [[x type-name] context]
  (let [type-name (name type-name)]
    (when-not (h2x/raw-type-name? type-name)
      (throw (ex-info "Invalid type" {:type type-name})))
    (append-sql! context "CAST(")
    (compile! x context)
    (append-sql! context " AS ")
    (append-sql! context type-name)
    (append-sql! context ")")))

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

(defn- -exists! [sql subquery context]
  (append-sql! context sql)
  (append-sql! context "(")
  (map! subquery context)
  (append-sql! context ")"))

(defn- inline! [x context]
  (when-not ((some-fn number? boolean?) x)
    (throw (ex-info ":inline is only allowed for numbers and booleans" {:x x})))
  (compile! x context))

(defn- -binary-operator! [f args context]
  (let [f-str (case f
                :like     " LIKE "
                :not-like " NOT LIKE "
                (str \space (name f) \space))]
    (-interpose! f-str args context)))

(defn- -simple-fn! [f args context]
  (let [f (name f)]
    (append-sql! context f))
  (-list! args context))

(defn- h2x-identifier! [[_identifier-type parts] context]
  (interpose-fn parts #(-identifier-part! % context) #(append-sql! context ".")))

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
  (when-not (re-matches #"^[a-zA-Z0-9]+$" (name unit))
    (throw (ex-info "Invalid unit" {:unit unit})))
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
  (compile! fraction context)
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
  ;; support stuff like `America/New_York`, `Etc/GMT+5`, or `America/Indiana/Indianapolis`
  (when-not (re-matches #"^[A-Za-z0-9_+\-]+(?:/[A-Za-z0-9_+\-]+){0,2}$" (name zone))
    (throw (ex-info "Invalid time zone" {:time-zone zone})))
  (append-sql! context "(")
  (compile! expr context)
  (append-sql! context " AT TIME ZONE '")
  (append-sql! context (name zone))
  (append-sql! context "')"))

(defn- -h2x-interval! [engine [amount unit] context]
  (when-not (number? amount)
    (throw (ex-info "Invalid amount" {:amount amount})))
  (when-not (#{:millisecond :second :minute :hour :day :week :month :year} unit)
    (throw (ex-info "Invalid unit" {:unit unit})))
  (append-sql! context (case engine
                         :postgres "INTERVAL '"
                         :mysql "INTERVAL "))
  (compile! amount context)
  (append-sql! context " ")
  (append-sql! context (name unit))
  (when (= engine :postgres)
    (append-sql! context "'")))

(defn- -fn-call! [[f & args] context]
  ;; this `case` has no default/fallthrough clause on purpose: `f` can come from an attacker-derived `:%foo`
  ;; keyword (see `keyword!`), so an unrecognized function name must throw instead of being spliced into the SQL raw.
  ;; Do not add a default branch here that echoes `f`'s name into the output.
  (case f
    :not                    (not!     args context)
    :between                (between! args context)
    :cast                   (cast!    args context)
    :case                   (case!    args context)
    (:= :is)                (-equals! " = "  " IS NULL"     args context)
    (:<> :!= :not= :is-not) (-equals! " <> " " IS NOT NULL" args context)
    :and                    (-compound! " AND " args context)
    :or                     (-compound! " OR "  args context)
    :in                     (-in! f args context)
    :not-in                 (-in! f args context)
    :exists                 (-exists! "EXISTS "     (first args) context)
    :not-exists             (-exists! "NOT EXISTS " (first args) context)
    :inline                 (inline! (first args) context)

    (:< :<= :> :>= :like :not-like)
    (-binary-operator! f args context)

    (:avg
     :coalesce
     :concat
     :count
     :current_database
     :current_schema
     :database
     :distinct
     :isnull
     :lower
     :max
     :min
     :now
     :sum
     :upper)
    (-simple-fn! f args context)

    :metabase.util.honey-sql-2/identifier        (h2x-identifier! args context)
    :metabase.util.honey-sql-2/literal           (h2x-literal! (first args) context)
    :metabase.util.honey-sql-2/extract           (h2x-extract! args context)
    :metabase.util.honey-sql-2/distinct-count    (h2x-distinct-count! (first args) context)
    :metabase.util.honey-sql-2/percentile-cont   (h2x-percentile-cont! args context)
    :metabase.util.honey-sql-2/collate           (h2x-collate! args context)
    :metabase.util.honey-sql-2/at-time-zone      (h2x-at-time-zone! args context)
    :metabase.util.honey-sql-2/typed             (compile! (first args) context)
    :metabase.util.honey-sql-2/postgres-interval (-h2x-interval! :postgres args context)
    :metabase.util.honey-sql-2/mysql-interval    (-h2x-interval! :mysql args context)))

(defn- vector! [xs context]
  (if (keyword? (first xs))
    (-fn-call! xs context)
    (-commas! xs context)))

;; note that `clojure.lang.IPersistentMap` is not supported here; this is intentional, as we don't want to
;; accidentally support nested query injection. Treat maps as normal objects (i.e., parameterized with `?`) unless
;; explicitly passed to the top-level entry point, [[compile]].
(extend-protocol Compile
  Object                         (compile! [this context] (object! this context))
  nil                            (compile! [this context] (null! this context))
  Boolean                        (compile! [this context] (boolean! this context))
  Number                         (compile! [this context] (number! this context))
  clojure.lang.Keyword           (compile! [this context] (keyword! this context))
  clojure.lang.IPersistentVector (compile! [this context] (vector! this context)))

(defn- default-context [engine]
  (let [sb   (StringBuilder.)
        args (volatile! (transient []))]
    (reify Context
      (append-sql! [_this s]   (.append sb s))
      (append-arg! [_this arg] (vswap! args conj! arg))
      (engine      [_this]     engine)
      (result!     [_this]     (into [(str sb)] (persistent! @args))))))

(mu/defn format :- [:cat :string [:* :any]]
  "Compile `honeysql-form` (either a top-level map or an individual clause) to SQL for `engine`."
  [honeysql-form :- [:or
                     [:map {:metabase.util.malli.registry/deliberately-open true}]
                     vector?]
   engine :- [:enum :h2 :postgres :mysql]]
  (let [context (default-context engine)]
    ;; [[compile!]] doesn't support compiling maps recursively on purpose
    ((if (map? honeysql-form)
       map!
       compile!) honeysql-form context)
    (result! context)))

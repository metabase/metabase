(ns metabase.funnysql.core
  (:refer-clojure :exclude [compile])
  (:require
   [clojure.string :as str]
   [flatland.ordered.map :as ordered-map]
   [metabase.util :as u]
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

(defn- null!    [_x context] (append-sql! context "NULL"))
(defn- integer! [n context]  (append-sql! context (str n)))

(defn- interpose-fn
  "Iterate all elements in `xs`. Execute `(x-fn <x>)` for each item in `xs`. Execute `(separator-fn)` in between each
  item in `xs`."
  [xs x-fn separator-fn]
  (loop [[x & more] xs]
    (x-fn x)
    (when (seq more)
      (separator-fn)
      (recur more))))

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

(declare equals!)

(defn- -kvs-map! [kvs context]
  (interpose-fn kvs #(equals! % context) #(append-sql! context ", ")))

(defn- unwrap-identifier [identifier]
  (if (vector? identifier)
    (recur (first identifier))
    identifier))

(declare map!)

(defn- with! [sql ctes context]
  (append-sql! context sql)
  (letfn [(-cte [[identifier subquery]]
            (compile! identifier context)
            (append-sql! context " AS (")
            (map! subquery context)
            (append-sql! context ")"))]
    (interpose-fn ctes -cte #(append-sql! context ", "))))

(defn- insert-into! [identifier context]
  (append-sql! context "INSERT INTO ")
  (compile! (unwrap-identifier identifier) context))

(defn- values! [rows context]
  (let [columns (keys (first rows))]
    (-list! columns context))
  (append-sql! context " VALUES ")
  (interpose-fn rows #(-list! (vals %) context) #(append-sql! context ", ")))

(defn- update! [identifier context]
  (append-sql! context "UPDATE ")
  (compile! (unwrap-identifier identifier) context))

(defn- set! [kvs context]
  (append-sql! context "SET ")
  (-kvs-map! kvs context))

(defn- delete-from! [identifier context]
  (append-sql! context "DELETE FROM ")
  (compile! (unwrap-identifier identifier) context))

(defn- select! [sql cols context]
  (append-sql! context sql)
  (interpose-fn cols #(-identifier-with-optional-as! % context) #(append-sql! context ", ")))

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
  (assert (nat-int? n))
  (append-sql! context "LIMIT ")
  (compile! n context))

(defn- offset!
  [n context]
  (assert (nat-int? n))
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
  (-list! columns context))

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

(defn- -identifier-component!
  "Emit a single quoted and escaped identifier part."
  [part context]
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
    (append-sql! context quote-char)))

(defn -identifier!
  "Emit a (possibly qualified) identifier composed of multiple [[-identifier-component]]s."
  [s context]
  (interpose-fn (str/split s #"\.") #(-identifier-component! % context) #(append-sql! context ".")))

(defn- keyword!
  "Compile a keyword as a quoted and escaped identifier."
  [k context]
  (when (qualified-keyword? k)
    (-identifier! (namespace k) context)
    (append-sql! context "."))
  (if (= (name k) "*")
    (append-sql! context "*")
    (-identifier! (name k) context)))

(defn- -equals! [sql nil-sql [x y] context]
  (compile! x context)
  (if (some? y)
    (do
      (append-sql! context sql)
      (compile! y context))
    (append-sql! context nil-sql)))

(defn- equals! [args context]
  (-equals! " = "  " IS NULL" args context))

(defn- -compound! [sql xs context]
  (interpose-fn xs #(-parens! % context) #(append-sql! context sql)))

(defn- not! [[x] context]
  (append-sql! context "NOT ")
  (-parens! x context))

(defn- -in! [sql [lhs vs] context]
  (compile! lhs context)
  (append-sql! context sql)
  (-list! vs context))

(defn- between! [[x y z] context]
  (compile! x context)
  (append-sql! context " BETWEEN ")
  (compile! y context)
  (append-sql! context " AND ")
  (compile! z context))

(defn- cast! [[x type-name] context]
  (append-sql! context "CAST(")
  (compile! x context)
  (append-sql! context " AS ")
  (let [type-name (name type-name)]
    (when-not (re-matches #"^[A-Za-z_][()A-Za-z0-9_-]*$" type-name)
      (throw (ex-info "Invalid type" {:type type-name})))
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

(defn- -binary-operator! [f args context]
  (let [f-str (case f
                :like     " LIKE "
                :not-like " NOT LIKE "
                (str \space (name f) \space))]
    (-interpose! f-str (take 2 args) context)))

(defn- -simple-fn! [f args context]
  (let [f (name f)]
    (append-sql! context f)
    (-list! args context)))

(defn- -fn-call! [[f & args] context]
  (case f
    :not                    (not!     args context)
    :between                (between! args context)
    :cast                   (cast!    args context)
    :case                   (case!    args context)
    (:= :is)                (equals!  args context)
    (:<> :!= :not= :is-not) (-equals! " <> " " IS NOT NULL" args context)
    :and                    (-compound! " AND " args context)
    :or                     (-compound! " OR "  args context)
    :in                     (-in! " IN "     args context)
    :not-in                 (-in! " NOT IN " args context)
    :exists                 (-exists! "EXISTS "     (first args) context)
    :not-exists             (-exists! "NOT EXISTS " (first args) context)

    (:< :<= :> :>= :like :not-like)
    (-binary-operator! f args context)

    (:lower :upper :concat :coalesce :count :sum :avg :min :max :distinct)
    (-simple-fn! f args context)))

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
  Long                           (compile! [this context] (integer! this context))
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

(mu/defn compile :- [:cat :string [:* :any]]
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

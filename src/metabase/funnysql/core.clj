(ns metabase.funnysql.core
  (:refer-clojure :exclude [compile])
  (:require
   [clojure.string :as str]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defprotocol ^:private Context
  (^:private -append-sql! [this s])
  (^:private -append-arg! [this arg])
  (^:private -engine [this])
  (^:private -result! [this]))

(defprotocol Compile
  (^:private -compile [x context]))

;; TODO -- should `context` always be the first arg, for consistency!

(defn- -object [x context]
  (assert (not (instance? Character x))) ; NOCOMMIT
  (-append-sql! context "?")
  (-append-arg! context x))

(defn- -null [_x context]
  (-append-sql! context "NULL"))

(defn- -integer [n context]
  (-append-sql! context (str n)))

(defn- interpose-fn
  "Iterate all elements in `xs`. Execute

    (x-fn <x>)

  for each item in `xs`. Execute

    (separator-fn)

  in between each item in `xs`."
  [xs x-fn separator-fn]
  (loop [[x & more] xs]
    (x-fn x)
    (when (seq more)
      (separator-fn)
      (recur more))))

(defn- -interpose
  "Compile all the forms in `xs` and interpose the `separator` string between them."
  [separator xs context]
  (assert (string? separator)) ; NOCOMMIT
  (assert (not (string? xs))) ; NOCOMMIT
  (interpose-fn
   xs
   #(-compile % context)
   #(-append-sql! context separator)))

(defn- -commas
  "Compile all the forms in `xs` with commas between each item."
  [xs context]
  (-interpose ", " xs context))

(defn- -parens
  "Compile `x` with parentheses before and after it."
  [x context]
  (-append-sql! context "(")
  (-compile x context)
  (-append-sql! context ")"))

(defn- -list
  "Compile a list form (combines behavior of [[-parens]] and [[-commas]])."
  [xs context]
  (-append-sql! context "(")
  (-commas xs context)
  (-append-sql! context ")"))

(defn- -identifier-with-optional-as
  "Handle an identifier form as seen in `:select`, `:from`, etc.; unwrapped or a vector with one element will act an
  unaliased identifier while a vector with two elements will emit `<x> AS <y>`."
  [identifier context]
  (let [[lhs rhs] (if (vector? identifier)
                    identifier
                    [identifier])]
    (-compile lhs context)
    (when rhs
      (-append-sql! context " AS ")
      (-compile rhs context)))
  nil)

(defn- -select
  "Emit a `SELECT` clause."
  [cols context]
  (-append-sql! context "SELECT ")
  (interpose-fn
   cols
   #(-identifier-with-optional-as % context)
   #(-append-sql! context ", ")))

(defn- -from
  "Emit a `FROM` clause."
  [from context]
  (-append-sql! context "FROM ")
  (if (keyword? from)
    (-identifier-with-optional-as from context)
    (interpose-fn
     from
     #(-identifier-with-optional-as % context)
     #(-append-sql! context ", "))))

(defn- -where
  "Emit a `WHERE` clause."
  [condition context]
  (-append-sql! context "WHERE ")
  (-compile condition context))

(defn- -map
  "Compile a map. This is normally only allowed by [[compile]] but not by [[-compile]] to avoid accidentally compiling
  subqueries where unintended."
  [m context]
  ;; TODO -- ICK
  (transduce
   (comp (keep (fn [[k f]]
                 (when-let [v (k m)]
                   [f v])))
         (interpose ::space)
         (map (fn [x]
                (if (= x ::space)
                  (-append-sql! context " ")
                  (let [[f v] x]
                    (f v context))))))
   (constantly nil)
   nil
   [[:select -select]
    [:from   -from]
    [:where  -where]]))

;; TODO -- escape identifier
(defn- -identifier-component
  "Emit a single quoted and escaped identifier part."
  [part context]
  (let [engine     (-engine context)
        quote-char (case engine
                     :mysql "`"
                     "\"")]
    (-append-sql! context quote-char)
    (-append-sql! context (case engine
                            :h2 (u/upper-case-en part)
                            part))
    (-append-sql! context quote-char)))

(defn -indentifier
  "Emit a (possibly qualified) identifier composed of multiple [[-identifier-component]]s."
  [s context]
  (interpose-fn
   (str/split s #"\.")
   #(-identifier-component % context)
   #(-append-sql! context ".")))

(defn- -keyword
  "Compile a keyword as a quoted and escaped identifier."
  [k context]
  (when (qualified-keyword? k)
    (-indentifier (namespace k) context)
    (-append-sql! context "."))
  (if (= (name k) "*")
    (-append-sql! context "*")
    (-indentifier (name k) context)))

(defn- -equals [[x y] context]
  (-compile x context)
  (if (some? y)
    (do
      (-append-sql! context " = ")
      (-compile y context))
    (-append-sql! context " IS NULL")))

(defn- -not-equals [[x y] context]
  (-compile x context)
  (if (some? y)
    (do
      (-append-sql! context " <> ")
      (-compile y context))
    (-append-sql! context " IS NOT NULL")))

(defn- -and [xs context]
  (interpose-fn
   xs
   #(-parens % context)
   #(-append-sql! context " AND ")))

(defn- -or [xs context]
  (interpose-fn
   xs
   #(-parens % context)
   #(-append-sql! context " OR ")))

(defn- -in [[lhs vs] context]
  (-compile lhs context)
  (-append-sql! context " IN ")
  (-list vs context))

(defn- -between [[x y z] context]
  (-compile x context)
  (-append-sql! context " BETWEEN ")
  (-compile y context)
  (-append-sql! context " AND ")
  (-compile z context))

(defn- -binary-operator [f fn-args context]
  (let [f-str (case f
                :<        " < "
                :<=       " <= "
                :>        " > "
                :>=       " >= "
                :like     " LIKE "
                :not-like " NOT LIKE ")]
    (-interpose f-str (take 2 fn-args) context)))

(defn- -simple-fn [f fn-args context]
  (let [f (name f)]
    (-append-sql! context f)
    (-list fn-args context)))

(defn- -fn-call [[f & fn-args] context]
  (case f
    :=              (-equals fn-args context)
    (:<> :!= :not=) (-not-equals fn-args context)
    :and            (-and fn-args context)
    :or             (-or fn-args context)
    :in             (-in fn-args context)
    :between        (-between fn-args context)

    (:< :<= :> :>= :like :not-like)
    (-binary-operator f fn-args context)

    (:lower :upper :concat :coalesce)
    (-simple-fn f fn-args context)))

(defn- -vector [xs context]
  (if (keyword? (first xs))
    (-fn-call xs context)
    (-commas xs context)))

;; note that `clojure.lang.IPersistentMap` is not supported here; this is intentional, as we don't want to
;; accidentally support nested query injection. Treat maps as normal objects (i.e., parameterized with `?`) unless
;; explicitly passed to the top-level entry point, [[compile]].
(extend-protocol Compile
  Object
  (-compile [this context]
    (-object this context))

  nil
  (-compile [this context]
    (-null this context))

  Long
  (-compile [this context]
    (-integer this context))

  clojure.lang.Keyword
  (-compile [this context]
    (-keyword this context))

  clojure.lang.IPersistentVector
  (-compile [this context]
    (-vector this context)))

(defn- default-context [engine]
  (let [sb   (StringBuilder.)
        args (volatile! (transient []))]
    (reify Context
      (-append-sql! [_this s]
        (.append sb s))
      (-append-arg! [_this arg]
        (vswap! args conj! arg))
      (-engine [_this]
        engine)
      (-result! [_this]
        (into [(str sb)] (persistent! @args))))))

(mu/defn compile :- [:cat :string [:* :any]]
  "Compile `honeysql-form` (either a top-level map or an individual clause) to SQL for `engine`."
  [honeysql-form
   engine :- [:enum :h2 :postgres :mysql]]
  (let [context (default-context engine)]
    ;; don't support compiling maps recursively
    (if (map? honeysql-form)
      (-map honeysql-form context)
      (-compile honeysql-form context))
    (-result! context)))

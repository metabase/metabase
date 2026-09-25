(ns metabase.funnysql.core
  (:refer-clojure :exclude [compile])
  (:require
   [clojure.string :as str]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defprotocol Compile
  (-compile [x engine ^StringBuilder sb args]))

(defn- append! [^StringBuilder sb ^String s]
  (.append sb s)
  nil)

(defn- -object [x _engine sb args]
  (append! sb "?")
  (vswap! args conj! x))

(defn- -null [_x _engine sb _args]
  (append! sb "NULL"))

(defn- -integer [n _engine sb _args]
  (append! sb (str n)))

(defn- interpose-fn [xs x-fn separator-fn]
  (loop [[x & more] xs]
    (x-fn x)
    (when (seq more)
      (separator-fn)
      (recur more))))

(defn- -interpose [separator xs engine sb args]
  (interpose-fn
   xs
   #(-compile % engine sb args)
   #(append! sb separator)))

(defn- -commas [xs engine sb args]
  (-interpose ", " xs engine sb args))

(defn- -parens [x engine sb args]
  (append! sb "(")
  (-compile x engine sb args)
  (append! sb ")"))

(defn- -list [xs engine sb args]
  (append! sb "(")
  (-commas xs engine sb args)
  (append! sb ")"))

(defn- -identifier-with-optional-as [identifier engine sb args]
  (let [[lhs rhs] (if (vector? identifier)
                    identifier
                    [identifier])]
    (-compile lhs engine sb args)
    (when rhs
      (append! sb " AS ")
      (-compile rhs engine sb args)))
  nil)

(defn- -select [cols engine sb args]
  (append! sb "SELECT ")
  (interpose-fn
   cols
   #(-identifier-with-optional-as % engine sb args)
   #(append! sb ", ")))

(defn- -from [from engine sb args]
  (append! sb "FROM ")
  (if (keyword? from)
    (-identifier-with-optional-as from engine sb args)
    (interpose-fn
     from
     #(-identifier-with-optional-as % engine sb args)
     #(append! sb ", "))))

(defn- -where [condition engine sb args]
  (append! sb "WHERE ")
  (-compile condition engine sb args))

(defn- -map [m engine sb args]
  ;; TODO -- ICK
  (transduce
   (comp (keep (fn [[k f]]
                 (when-let [v (k m)]
                   [f v])))
         (interpose ::space)
         (map (fn [x]
                (if (= x ::space)
                  (append! sb " ")
                  (let [[f v] x]
                    (f v engine sb args))))))
   (constantly nil)
   nil
   [[:select -select]
    [:from   -from]
    [:where  -where]]))

;; TODO -- escape identifier
(defn- -identifier-component [part engine sb]
  (let [quote-char (case engine
                     :mysql "`"
                     "\"")]
    (append! sb quote-char)
    (append! sb (case engine
                  :h2 (u/upper-case-en part)
                  part))
    (append! sb quote-char)))

(defn -indentifier [s engine sb]
  (interpose-fn
   (str/split s #"\.")
   #(-identifier-component % engine sb)
   #(append! sb ".")))

(defn- -keyword [k engine sb _args]
  (when (qualified-keyword? k)
    (-indentifier (namespace k) engine sb)
    (append! sb "."))
  (if (= (name k) "*")
    (append! sb "*")
    (-indentifier (name k) engine sb)))

(defn- -equals [[x y] engine sb args]
  (-compile x engine sb args)
  (if (some? y)
    (do
      (append! sb " = ")
      (-compile y engine sb args))
    (append! sb " IS NULL")))

(defn- -not-equals [[x y] engine sb args]
  (-compile x engine sb args)
  (if (some? y)
    (do
      (append! sb " <> ")
      (-compile y engine sb args))
    (append! sb " IS NOT NULL")))

(defn- -and [xs engine sb args]
  (interpose-fn
   xs
   #(-parens % engine sb args)
   #(append! sb " AND ")))

(defn- -or [xs engine sb args]
  (interpose-fn
   xs
   #(-parens % engine sb args)
   #(append! sb " OR ")))

(defn- -binary-fn [f fn-args engine sb args]
  (-interpose fn-args (str " " (name f) " ") engine sb args))

(defn- -in [[lhs vs] engine sb args]
  (-compile lhs engine sb args)
  (append! sb " IN ")
  (-list vs engine sb args))

(defn- -fn-call [[f & fn-args] engine sb args]
  (case f
    :=              (-equals fn-args engine sb args)
    (:<> :!= :not=) (-not-equals fn-args engine sb args)
    :and            (-and fn-args engine sb args)
    :or             (-or fn-args engine sb args)
    (:< :<= :> :>=) (-binary-fn f fn-args engine sb args)
    :in             (-in fn-args engine sb args)))

(defn- -vector [xs engine sb args]
  (if (keyword? (first xs))
    (-fn-call xs engine sb args)
    (-commas xs engine sb args)))

(extend-protocol Compile
  Object
  (-compile [this engine sb args]
    (-object this engine sb args))

  nil
  (-compile [this engine sb args]
    (-null this engine sb args))

  Long
  (-compile [this engine sb args]
    (-integer this engine sb args))

  clojure.lang.Keyword
  (-compile [this engine sb args]
    (-keyword this engine sb args))

  clojure.lang.IPersistentVector
  (-compile [this engine sb args]
    (-vector this engine sb args)))

(defn compile [x engine]
  (let [sb   (StringBuilder.)
        args (volatile! (transient []))]
    ;; don't support compiling maps recursively
    (if (map? x)
      (-map x engine sb args)
      (-compile x engine sb args))
    (into [(str sb)] (persistent! @args))))

(comment
  (compile {:select [:x [:y :alias]]
            :from [[:table]]
            :where [:and
                    [:= :field 100]
                    [:< :field "s"]
                    [:in :table.field [1 2 3]]]}
           :h2))

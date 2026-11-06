(ns metabase.util.toucan2
  "Toucan 2 call macros that bind every runtime value with `[:auto/param ...]` unless it is a [[Fragment]]."
  (:require
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftype Fragment [form])

(defn- fragment? [x]
  (instance? Fragment x))

(defn value
  "`x` where a macro here found a runtime form: a [[Fragment]] unwrapped, an integer as is, anything else as
  `[:auto/param x]`."
  [x]
  (cond
    (fragment? x) (.-form ^Fragment x)
    (integer? x)  x
    :else         [:auto/param x]))

(defn- dynamic? [form]
  (or (symbol? form) (seq? form)))

(defn- wrap-dynamic
  "`form` with every symbol or call inside its literal maps, vectors and sets wrapped in a [[value]] call."
  [form]
  (cond
    (dynamic? form) (list `value form)
    (map? form)     (into {} (map (fn [[k v]] [k (wrap-dynamic v)])) form)
    (vector? form)  (mapv wrap-dynamic form)
    (set? form)     (into #{} (map wrap-dynamic) form)
    :else           form))

(defmacro fragment
  "A [[Fragment]] of literal `form`, with every runtime value inside it handled by [[value]]."
  [form]
  `(->Fragment ~(wrap-dynamic form)))

(defn- wrap-args
  "`[modelable & args]` with the kv-arg values and the trailing query map handled by [[wrap-dynamic]]; throws when the
  trailing arg is not a literal map, since Toucan runs a string or vector there as raw SQL."
  [[modelable & args]]
  (let [[kvs tail] (if (odd? (count args))
                     [(butlast args) [(last args)]]
                     [args []])]
    (doseq [q tail]
      (when-not (map? q)
        (throw (ex-info (str "The trailing arg must be a literal query map; write a primary key as `:id <value>`: "
                             (pr-str q))
                        {:form q}))))
    (concat [modelable]
            (mapcat (fn [[k v]] [k (wrap-dynamic v)]) (partition 2 kvs))
            (map wrap-dynamic tail))))

(defmacro select
  "`t2/select` with every runtime value bound."
  [& args]
  `(t2/select ~@(wrap-args args)))

(defmacro select-one
  "`t2/select-one` with every runtime value bound."
  [& args]
  `(t2/select-one ~@(wrap-args args)))

(defmacro select-pk->fn
  "`t2/select-pk->fn` with every runtime value bound."
  [f & args]
  `(t2/select-pk->fn ~f ~@(wrap-args args)))

(defmacro delete!
  "`t2/delete!` with every runtime value bound."
  [& args]
  `(t2/delete! ~@(wrap-args args)))

(defmacro update!
  "`t2/update!` with every runtime value in its conditions bound; the changes map is left to Toucan's transforms."
  [& args]
  `(t2/update! ~@(wrap-args (butlast args)) ~(last args)))

(defmacro insert!
  "`t2/insert!`, with the rows left to Toucan's transforms."
  [& args]
  `(t2/insert! ~@args))

(defmacro query
  "`t2/query` on literal query map `m` with every runtime value bound."
  [m]
  `(t2/query ~(wrap-dynamic m)))

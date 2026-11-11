(ns metabase.toucan.impl
  "Toucan 2 call macros that bind every runtime value with `[:auto/param ...]` unless it is a [[fragment]]."
  (:refer-clojure :exclude [count])
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.query :as t2.query]
   [toucan2.tools.transformed])
  (:import
   (toucan2.tools.transformed RecordTypeForInterceptingApplyKVArgCalls)))

(set! *warn-on-reflection* true)

(defonce ^:private fragment-key
  (Object.))

(defn fragment?
  "Whether `x` is exactly what [[fragment]] built: its metadata holds the built form under a key only this namespace
  has, and `assoc`, `conj` or a copied `meta` all leave `x` unequal to it."
  [x]
  (let [m (meta x)]
    (and (contains? m fragment-key)
         (= x (get m fragment-key)))))

(defn- ->fragment
  "`form` marked as a [[fragment]] and, for the app-DB guards, as an allowed subquery."
  [form]
  (vary-meta form assoc fragment-key form :allow-subquery true))

(defn value
  "`x` where a macro here found a runtime form: a [[fragment]] as is, anything else as
  `[:auto/param x]`."
  [x]
  (if (fragment? x)
    x
    [:auto/param x]))

(defn- marker? [x]
  (and (vector? x)
       (= 2 (clojure.core/count x))
       (= :auto/param (first x))))

(defn- nested-marker-paths
  "The `get-in` paths of the `[:auto/param ...]` markers inside operator form `v`, not counting `v` itself."
  [v]
  (letfn [(paths [x path]
            (cond
              (marker? x) [path]
              (vector? x) (into [] (mapcat (fn [i] (paths (nth x i) (conj path i)))) (range (clojure.core/count x)))
              :else       []))]
    (when (and (vector? v) (not (marker? v)))
      (paths v []))))

(methodical/defmethod t2.query/apply-kv-arg :around [:default RecordTypeForInterceptingApplyKVArgCalls :default]
  "Run a column's transform on the values inside the markers of an operator kv-arg, then mark them again; otherwise the
  transform also rewrites the `:auto/param` keyword."
  [model query k v]
  (if-let [paths (seq (nested-marker-paths v))]
    (let [[k v*] (next-method model query k (reduce (fn [v path] (update-in v path second)) v paths))]
      [k (reduce (fn [v path] (update-in v path (fn [x] [:auto/param x]))) v* paths)])
    (next-method model query k v)))

(defn- dynamic? [form]
  (or (symbol? form) (seq? form)))

(defn- name-call?
  "Whether `form` calls [[table-name]] or [[column-name]], whose literal args make the result safe to leave unbound."
  [form]
  (and (seq? form)
       (symbol? (first form))
       (contains? '#{metabase.toucan.core/table-name metabase.toucan.impl/table-name
                     metabase.toucan.core/column-name metabase.toucan.impl/column-name}
                  (some-> (resolve (first form)) symbol))))

(defn- wrap-dynamic
  "`form` with every symbol or call inside its literal maps, vectors and sets wrapped in a [[value]] call."
  [form]
  (cond
    (name-call? form)       form
    (dynamic? form)         (list `value form)
    (map? form)             (into {} (map (fn [[k v]] [k (wrap-dynamic v)])) form)
    (vector? form)          (mapv wrap-dynamic form)
    (set? form)             (into #{} (map wrap-dynamic) form)
    :else                   form))

(defmacro table-name
  "`t2/table-name` of literal model keyword `model`, which the macros here leave unbound."
  [model]
  (when-not (keyword? model)
    (throw (ex-info (str "The model must be a literal keyword: " (pr-str model)) {:form model})))
  `(t2/table-name ~model))

(defn- check-name-part
  "Throw unless `part` is a literal simple keyword naming a single identifier part."
  [part]
  (when-not (and (simple-keyword? part)
                 (re-matches #"[A-Za-z_][A-Za-z0-9_]*" (name part)))
    (throw (ex-info (str "Expected a literal keyword naming one identifier: " (pr-str part)) {:form part}))))

(defmacro column-name
  "Literal column keyword `column`, qualified by literal alias keyword `alias` when given."
  ([column]
   (check-name-part column)
   column)
  ([alias column]
   (check-name-part alias)
   (check-name-part column)
   (keyword (str (name alias) "." (name column)))))

(defmacro fragment
  "Literal `form` marked as a fragment, with every runtime value inside it handled by [[value]]."
  [form]
  `(#'->fragment ~(wrap-dynamic form)))

(defn- wrap-args
  "`[modelable & args]` with the kv-arg values and the trailing query map handled by [[wrap-dynamic]]; throws when the
  trailing arg is not a literal map, since Toucan runs a string or vector there as raw SQL."
  [[modelable & args]]
  (let [[kvs tail] (if (odd? (clojure.core/count args))
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

(defn- wrap-query
  "Literal query map `m` handled by [[wrap-dynamic]]; throws for anything else, since Toucan runs a string or vector as raw
  SQL."
  [m]
  (when-not (map? m)
    (throw (ex-info (str "The query must be a literal query map: " (pr-str m)) {:form m})))
  (wrap-dynamic m))

(defmacro select
  "`t2/select` with every runtime value bound."
  [& args]
  `(t2/select ~@(wrap-args args)))

(defmacro select-one
  "`t2/select-one` with every runtime value bound."
  [& args]
  `(t2/select-one ~@(wrap-args args)))

(defmacro select-one-pk
  "`t2/select-one-pk` with every runtime value bound."
  [& args]
  `(t2/select-one-pk ~@(wrap-args args)))

(defmacro select-pks-set
  "`t2/select-pks-set` with every runtime value bound."
  [& args]
  `(t2/select-pks-set ~@(wrap-args args)))

(defmacro select-pks-vec
  "`t2/select-pks-vec` with every runtime value bound."
  [& args]
  `(t2/select-pks-vec ~@(wrap-args args)))

(defmacro reducible-select
  "`t2/reducible-select` with every runtime value bound."
  [& args]
  `(t2/reducible-select ~@(wrap-args args)))

(defmacro exists?
  "`t2/exists?` with every runtime value bound."
  [& args]
  `(t2/exists? ~@(wrap-args args)))

(defmacro count
  "`t2/count` with every runtime value bound."
  [& args]
  `(t2/count ~@(wrap-args args)))

(defmacro select-fn-set
  "`t2/select-fn-set` with every runtime value bound."
  [f & args]
  `(t2/select-fn-set ~f ~@(wrap-args args)))

(defmacro select-fn-vec
  "`t2/select-fn-vec` with every runtime value bound."
  [f & args]
  `(t2/select-fn-vec ~f ~@(wrap-args args)))

(defmacro select-fn-reducible
  "`t2/select-fn-reducible` with every runtime value bound."
  [f & args]
  `(t2/select-fn-reducible ~f ~@(wrap-args args)))

(defmacro select-one-fn
  "`t2/select-one-fn` with every runtime value bound."
  [f & args]
  `(t2/select-one-fn ~f ~@(wrap-args args)))

(defmacro select-pk->fn
  "`t2/select-pk->fn` with every runtime value bound."
  [f & args]
  `(t2/select-pk->fn ~f ~@(wrap-args args)))

(defmacro select-fn->pk
  "`t2/select-fn->pk` with every runtime value bound."
  [f & args]
  `(t2/select-fn->pk ~f ~@(wrap-args args)))

(defmacro select-fn->fn
  "`t2/select-fn->fn` with every runtime value bound."
  [f1 f2 & args]
  `(t2/select-fn->fn ~f1 ~f2 ~@(wrap-args args)))

(defmacro delete!
  "`t2/delete!` with every runtime value bound."
  [& args]
  `(t2/delete! ~@(wrap-args args)))

(defmacro update!
  "`t2/update!` with every runtime value in its conditions bound; the changes map is left to Toucan's transforms."
  [& args]
  `(t2/update! ~@(wrap-args (butlast args)) ~(last args)))

(defmacro update-returning-pks!
  "`t2/update-returning-pks!` with every runtime value in its conditions bound; the changes map is left to Toucan's
  transforms."
  [& args]
  `(t2/update-returning-pks! ~@(wrap-args (butlast args)) ~(last args)))

(defmacro query
  "`t2/query` on literal query map `m` with every runtime value bound."
  [m]
  `(t2/query ~(wrap-query m)))

(defmacro query-one
  "`t2/query-one` on literal query map `m` with every runtime value bound."
  [m]
  `(t2/query-one ~(wrap-query m)))

(defmacro reducible-query
  "`t2/reducible-query` on literal query map `m` with every runtime value bound."
  [m]
  `(t2/reducible-query ~(wrap-query m)))

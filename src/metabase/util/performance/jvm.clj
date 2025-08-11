(ns metabase.util.performance.jvm
  "Parts of `metabase.util.performance` namespace that are Clojure-only.")

;; clojure.walk reimplementation. Partially adapted from https://github.com/tonsky/clojure-plus.

(defn- editable? [coll]
  (instance? clojure.lang.IEditableCollection coll))

(defn- transient? [coll]
  (instance? clojure.lang.ITransientCollection coll))

(defn- assoc+ [coll key value]
  (cond
    (transient? coll) (assoc! coll key value)
    (editable? coll)  (assoc! (transient coll) key value)
    :else             (assoc  coll key value)))

(defn- dissoc+ [coll key]
  (cond
    (transient? coll) (dissoc! coll key)
    (editable? coll)  (dissoc! (transient coll) key)
    :else             (dissoc  coll key)))

(defn- maybe-persistent! [coll]
  (cond-> coll
    (transient? coll) persistent!))

(defn walk
  "Like `clojure.walk/walk`, but optimized for efficiency and has the following behavior differences:
  - Doesn't walk over map entries. When descending into a map, walks keys and values separately.
  - Uses transients and reduce where possible and tries to return the same input `form` if no changes were made."
  [inner outer form]
  (cond
    (map? form)
    (let [new-keys (volatile! (transient #{}))]
      (-> (reduce-kv (fn [m k v]
                       (let [k' (inner k)
                             v' (inner v)]
                         (if (identical? k' k)
                           (if (identical? v' v)
                             m
                             (assoc+ m k' v'))
                           (do (vswap! new-keys conj! k')
                               (if (contains? @new-keys k)
                                 (assoc+ m k' v')
                                 (-> m (dissoc+ k) (assoc+ k' v')))))))
                     form form)
          maybe-persistent!
          (with-meta (meta form))
          outer))

    (vector? form)
    (-> (reduce-kv (fn [v idx el]
                     (let [el' (inner el)]
                       (if (identical? el' el)
                         v
                         (assoc+ v idx el'))))
                   form form)
        maybe-persistent!
        (with-meta (meta form))
        outer)

    ;; Don't care much about optimizing seq and generic coll cases. When efficiency is required, use vectors.
    (seq? form) (outer (with-meta (seq (mapv inner form)) (meta form))) ;;
    (coll? form) (outer (with-meta (into (empty form) (map inner) form) (meta form)))
    :else (outer form)))

(defn prewalk
  "Like `clojure.walk/prewalk`, but uses a more efficient `metabase.util.performance/walk` underneath."
  [f form]
  (walk (fn prewalker [form] (walk prewalker identity (f form))) identity (f form)))

(defn postwalk
  "Like `clojure.walk/postwalk`, but uses a more efficient `metabase.util.performance/walk` underneath."
  [f form]
  (walk (fn postwalker [form] (walk postwalker f form)) f form))

(defn keywordize-keys
  "Like `clojure.walk/keywordize-keys`, but uses a more efficient `metabase.util.performance/walk` underneath and
  preserves original metadata on the transformed maps."
  [m]
  (postwalk
   (fn [form]
     (if (map? form)
       (-> (reduce-kv (fn [m k v]
                        (if (string? k)
                          (-> m (dissoc+ k) (assoc+ (keyword k) v))
                          m))
                      form form)
           maybe-persistent!
           (with-meta (meta form)))
       form))
   m))

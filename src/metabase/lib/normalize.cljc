(ns metabase.lib.normalize
  (:require
   [metabase.lib.dispatch :as lib.dispatch]))

(defn- mbql-clause-type [x]
  (when (and (vector? x)
             ((some-fn keyword? string?) (first x)))
    (keyword (first x))))

(defn- map-type [m]
  (when (map? m)
    (some-> (or
             (:lib/type m)
             (get m "lib/type"))
            keyword)))

(defn- dispatch-value [x]
  (or
   (mbql-clause-type x)
   (map-type x)
   (keyword (lib.dispatch/dispatch-value x))))

(defmulti normalize
  "Ensure some part of an MBQL query `x`, e.g. a clause or map, is in the right shape after coming in from JavaScript or
  deserialized JSON (from the app DB or a REST API request). This is intended for things that are already in a
  generally correct pMBQL; to 'normalize' things from legacy MBQL, use [[metabase.lib.convert]].

  The default implementation will keywordize keys for maps, and convert some known keys
  using [[default-map-value-fns]]; for MBQL clauses, it will convert the clause name to a keyword and recursively
  normalize its options and arguments. Implement this method if you need custom behavior for something."
  {:arglists '([x])}
  dispatch-value)

(def default-map-value-fns
  "Default normalization functions keys when doing map normalization."
  {:base-type   keyword
   :type        keyword
   :lib/type    keyword
   :lib/options normalize
   :field_ref   normalize})

(defn normalize-map
  "[[normalize]] a map using `key-fn` (default [[clojure.core/keyword]]) for keys and
  `value-fns` (default [[default-map-value-fns]]; additional functions are merged into this map).

  This is the default implementation for maps. Custom map implementations can call this with a different `key-fn` or
  additional `value-fns` as needed."
  ([m]
   (normalize-map m keyword))

  ([m key-fn]
   (normalize-map m key-fn nil))

  ([m key-fn value-fns]
   (let [value-fns (merge default-map-value-fns value-fns)]
     (into {}
           (map (fn [[k v]]
                  (let [k (key-fn k)]
                    [k
                     (if-let [f (get value-fns k)]
                       (f v)
                       v)])))
           m))))

(defmethod normalize :dispatch-type/map
  [m]
  (normalize-map m))

(defn- default-normalize-mbql-clause [[tag opts & args]]
  (into [(keyword tag) (normalize opts)]
        (map normalize)
        args))

(defmethod normalize :default
  [x]
  (cond
    (mbql-clause-type x) (default-normalize-mbql-clause x)
    (map-type x)         (normalize-map x)
    :else                x))

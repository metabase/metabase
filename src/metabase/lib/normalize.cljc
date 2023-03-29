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
  {:arglists '([x])}
  dispatch-value)

(def default-map-value-fns
  {:base-type   keyword
   :type        keyword
   :lib/type    keyword
   :lib/options normalize
   :field_ref   normalize})

(defn normalize-map
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

(ns metabase.lib.convert
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.options :as lib.options]
   [metabase.lib.util :as lib.util]))

(defmulti ->pMBQL
  "Coerce something to pMBQL (the version of MBQL manipulated by Metabase Lib v2) if it's not already pMBQL."
  {:arglists '([x])}
  lib.dispatch/dispatch-value)

(defn- default-MBQL-clause->pMBQL [mbql-clause]
  (let [[clause-type options & args] (lib.options/ensure-uuid mbql-clause)]
    (into [clause-type options] (map ->pMBQL) args)))

(defmethod ->pMBQL :default
  [x]
  (if (and (vector? x)
           (keyword? (first x)))
    (default-MBQL-clause->pMBQL x)
    x))

(defmethod ->pMBQL :mbql/query
  [query]
  query)

(defmethod ->pMBQL :mbql.stage/mbql
  [stage]
  (reduce
   (fn [stage k]
     (if-not (get stage k)
       stage
       (update stage k ->pMBQL)))
   stage
   [:aggregation :breakout :expressions :fields :filter :order-by :joins]))

(defmethod ->pMBQL :mbql/join
  [join]
  (-> join
      (update :condition ->pMBQL)
      (update :stages ->pMBQL)))

(defmethod ->pMBQL :dispatch-type/sequential
  [xs]
  (mapv ->pMBQL xs))

(defmethod ->pMBQL :dispatch-type/map
  [m]
  (if (:type m)
    (-> (lib.util/pipeline m)
        (update :stages (fn [stages]
                          (mapv ->pMBQL stages))))
    (update-vals ->pMBQL m)))

(defmethod ->pMBQL :field
  [[_field x y]]
  (let [[id-or-name options] (if (map? x)
                               [y x]
                               [x y])
        options              (cond-> options
                               (not (:lib/uuid options))
                               (assoc :lib/uuid (str (random-uuid))))]
    [:field options id-or-name]))

(defmulti ->legacy-MBQL
  "Coerce something to legacy MBQL (the version of MBQL understood by the query processor and Metabase Lib v1) if it's
  not already legacy MBQL."
  {:arglists '([x])}
  lib.dispatch/dispatch-value)

(defmethod ->legacy-MBQL :default
  [x]
  x)

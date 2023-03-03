(ns metabase.lib.convert
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.options :as lib.options]
   [metabase.lib.util :as lib.util]))

(defmulti ->pMBQL
  {:arglists '([x])}
  lib.dispatch/dispatch-value)

(defmethod ->pMBQL :default
  [x]
  (if (and (vector? x)
           (keyword? (first x)))
    (lib.options/ensure-uuid x)
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
                               [x y])]
    (let [options (cond-> options
                    (not (:lib/uuid options))
                    (assoc :lib/uuid (str (random-uuid))))]
      [:field options id-or-name])))

(defmulti ->legacy-MBQL
  {:arglists '([x])}
  lib.dispatch/dispatch-value)

(defmethod ->legacy-MBQL :default
  [x]
  x)

(ns metabase.qp.preprocess.util
  (:require [metabase.lib.dispatch :as lib.dispatch]))

(defmulti walk-query
  {:arglists '([m f])}
  (fn [m _f]
    (lib.dispatch/dispatch-value m)))

(defmethod walk-query :mbql/query
  [query f]
  (-> query
      (update query :stages (fn [stages]
                              (f :lib.walk)
                              (walk-query))))

  )

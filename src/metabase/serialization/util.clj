(ns metabase.serialization.util
  "Helpers that serialization namespaces share."
  (:require
   [metabase.app-db.core :as app-db]))

(set! *warn-on-reflection* true)

(def batch-size
  "The number of rows, ids or entities that serialization queries or processes together, which is the number of rows
  one pass of an update write function takes."
  app-db/update-partition-size)

(defn index-first
  "The map from `(key-fn row)` to `(val-fn row)` for `rows`, keeping the first row of each key."
  [rows key-fn val-fn]
  (reduce (fn [m row]
            (let [k (key-fn row)]
              (cond-> m
                (not (contains? m k)) (assoc k (val-fn row)))))
          {}
          rows))

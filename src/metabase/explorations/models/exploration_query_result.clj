(ns metabase.explorations.models.exploration-query-result
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2])
  (:import
   (java.sql Blob)))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/ExplorationQueryResult [_model]
  :exploration_query_result)

(doto :model/ExplorationQueryResult
  (derive :metabase/model))

(defn- blob->bytes
  "H2 returns blob columns as `java.sql.Blob` instances; Postgres/MySQL hand back a `byte[]`
  directly. Normalize both to `byte[]` on read so consumers don't have to care."
  [v]
  (cond
    (nil? v)         nil
    (bytes? v)       v
    (instance? Blob v) (let [^Blob b v] (.getBytes b 1 (int (.length b))))
    :else            v))

(t2/deftransforms :model/ExplorationQueryResult
  {:result_data {:out blob->bytes}})

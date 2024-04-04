(ns metabase.query-processor.middleware.update-used-cards
  (:require
   [clojure.string :as str]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.store :as qp.store]
   [metabase.util.log :as log]
   #_{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2]))

(defn update-used-cards!
  "Around middleware that update last_used_at of all cards that were used during a query execution."
  [qp]
  (fn [query rff]
    (letfn [(rff* [metadata]
              ;; TODO: should this be done async for perf purposes? maybe this and process-userland-query should share a
              ;; pool?
              (let [used-cards (lib.metadata/cached-cards (qp.store/metadata-provider))]
                #_(t2/update! :model/Card :id [:in (map :id used-cards)] {:last_used_at :%now})
                (log/infof "%d cards were used during query execution: %s" (count used-cards) (str/join ";" (map :name used-cards))))
              (rff metadata))]
      (qp query rff*))))

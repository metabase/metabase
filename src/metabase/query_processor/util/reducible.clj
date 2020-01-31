(ns metabase.query-processor.util.reducible
  (:require [clojure.core.async :as a]))

(defn reducible-rows
  "Utility function for generating reducible rows when implementing `metabase.driver/execute-reducible-query`."
  [row-fn {:keys [canceled-chan]}]
  (reify
    clojure.lang.IReduceInit
    (reduce [_ rf init]
      (loop [acc init]
        (cond
          (reduced? acc)
          @acc

          (a/poll! canceled-chan)
          acc

          :else
          (let [row (row-fn)]
            (if-not row
              (do
                (locking println (println "<All rows consumed.>")) ; NOCOMMIT
                acc)
              (recur (rf acc row)))))))))

;; TODO - an impl for QPs that return maps e.g. MongoDB

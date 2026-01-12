(ns hooks.metabase.util.timing
  "Custom CLJ Kondo hooks for timing-related linting rules."
  (:require [clj-kondo.hooks-api :as api]))

(defn discourage-millis-duration
  "Discourage slow and unreliable duration calculations using System/currentTimeMillis "
  [{:keys [node]}]
  (let [sexpr (api/sexpr node)]
    (when (and (list? sexpr) (= (first sexpr) '-) (>= (count sexpr) 2))
      (let [first-arg (second sexpr)]
        (when (= first-arg (list 'System/currentTimeMillis))
          (api/reg-finding!
           (assoc (meta node)
                  :message "Avoid System/currentTimeMillis for calculating durations. Use u/start-timer and u/since-ms for more reliability."
                  :type :metabase/discourage-millis-duration
                  :level :warning)))))))

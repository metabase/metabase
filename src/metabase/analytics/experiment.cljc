(ns metabase.analytics.experiment
  "Default experiment report function backed by metabase.analytics-interface.core.
   Requiring this namespace wires `report!` as the default report fn."
  (:require
   [metabase.analytics-interface.core :as analytics]
   [metabase.util.experiment :as experiment]))

(defn report!
  "Report an experiment result via the analytics interface (Prometheus on JVM, batched POST on CLJS).

   Expects a map with keys:
     :name                  - keyword identifying the experiment
     :match?                - whether control and candidate results matched
     :control-duration-ns   - nanoseconds the control took
     :candidate-duration-ns - nanoseconds the candidate took
     :control-outcome       - {:result v} or {:error t}
     :candidate-outcome     - {:result v} or {:error t}"
  [{:keys [name match? control-duration-ns candidate-duration-ns candidate-outcome]}]
  (let [labels                 {:experiment (cond-> (str name)
                                              (keyword? name) (subs 1))}
        error?                 (contains? candidate-outcome :error)
        outcome-key            (cond
                                 match? :experiment/matches-total
                                 error? :experiment/errors-total
                                 :else  :experiment/mismatches-total)
        candidate-duration-key (if error?
                                 :experiment/candidate-error-duration-ms
                                 :experiment/candidate-duration-ms)]
    (analytics/inc! :experiment/runs-total labels)
    (analytics/inc! outcome-key labels)
    (analytics/observe! :experiment/control-duration-ms labels (/ control-duration-ns 1e6))
    (analytics/observe! candidate-duration-key labels (/ candidate-duration-ns 1e6))))

;; Wire as the default report fn. Requiring this namespace is sufficient.
(experiment/set-default-report-fn! report!)

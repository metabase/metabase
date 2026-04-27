(ns metabase.agent-lib.eval.invoke
  "Trusted helper invocation and error shaping for structured evaluation."
  (:require
   [metabase.agent-lib.common.errors :as errors :refer [invalid-program! path->string]]
   [metabase.agent-lib.mbql-integration :as mbql]
   [metabase.agent-lib.runtime :as runtime]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn invoke-helper!
  "Invoke a helper that does not depend on the current query state."
  [runtime path op args]
  (when-not (contains? runtime/helper-symbols op)
    (invalid-program! path "unknown operator" {:operator (name op)}))
  (let [helper (runtime/helper-fn runtime op)]
    (try
      (apply helper args)
      (catch clojure.lang.ArityException e
        (invalid-program! path
                          (str "invalid arity for operator `" (name op) "`: " (ex-message e))
                          {:operator (name op)}))
      (catch Exception e
        (log/debugf e "Helper `%s` at %s threw unexpectedly" (name op) (path->string path))
        (throw (errors/wrap-runtime-error path (name op) e))))))

(defn invoke-query-aware-helper!
  "Invoke a helper that requires the current query state."
  [runtime current-query path op args]
  (when-not current-query
    (invalid-program! path
                      (format "`%s` requires the current query state" (name op))
                      {:operator (name op)}))
  (let [helper  (runtime/helper-fn runtime op)
        op-name (name op)]
    (try
      (apply helper current-query args)
      (catch clojure.lang.ArityException e
        (invalid-program! path
                          (str "invalid arity for operator `" op-name "`: " (ex-message e))
                          {:operator op-name}))
      (catch Exception e
        (case op-name
          "expression-ref"
          (invalid-program! path
                            (format "expression-ref %s does not exist at this point in the query"
                                    (pr-str (first args)))
                            {:operator "expression-ref"
                             :name     (first args)})

          "aggregation-ref"
          (invalid-program! path
                            (format "aggregation-ref %s does not exist at this point in the query"
                                    (first args))
                            {:operator "aggregation-ref"
                             :index    (first args)})

          (do (log/debugf e "Query-aware helper `%s` at %s threw unexpectedly" op-name (path->string path))
              (throw (errors/wrap-runtime-error path op-name e))))))))

(defn invoke-field-helper!
  "Invoke the special `field` helper, which can resolve relative to the current query."
  [runtime current-query path args]
  (if current-query
    (let [helper (runtime/helper-fn runtime 'field)]
      (try
        (apply helper current-query args)
        (catch clojure.lang.ArityException e
          (invalid-program! path
                            (str "invalid arity for operator `field`: " (ex-message e))
                            {:operator "field"}))
        (catch Exception e
          (log/debugf e "Field helper at %s threw unexpectedly" (path->string path))
          (throw (errors/wrap-runtime-error path "field" e)))))
    (invoke-helper! runtime path 'field args)))

(defn ensure-query-result!
  "Assert that structured evaluation produced a pMBQL query."
  [result]
  (when-not (mbql/query? result)
    (throw (ex-info "Structured program evaluation must return a pMBQL query map."
                    {:result-type (type result)
                     :result      result})))
  result)

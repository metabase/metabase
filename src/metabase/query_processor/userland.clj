(ns metabase.query-processor.userland
  (:require
   [metabase.query-processor.context-2 :as qp.context]
   [metabase.query-processor.middleware.catch-exceptions :as qp.catch-exceptions]
   [metabase.util.malli :as mu]))

;; The difference between `process-query` and the versions below is that the ones below are meant to power various
;; things like API endpoints and pulses, while `process-query` is more of a low-level internal function.
;;
#_(def userland-middleware
  "The default set of middleware applied to 'userland' queries ran via [[process-query-and-save-execution!]] (i.e., via
  the REST API). This middleware has the pattern

    (f (f query rff context)) -> (f query rff context)"
  (concat
   default-middleware
   [#'process-userland-query/process-userland-query
    #'catch-exceptions/catch-exceptions]))

(mu/defn userland-context :- qp.context/ContextInstance
  [context :- qp.context/ContextInstance]
  (-> context
      #_(assoc ::userland true)
      qp.catch-exceptions/catch-exceptions-context
      #_metabase.query-processor.middleware.process-userland-query/process-userland-query))

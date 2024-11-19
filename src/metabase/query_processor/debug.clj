(ns metabase.query-processor.debug
  "Debug QP stuff as follows:

    ;; start Portal if you have not done so already. Open http://localhost:4000 in your browser
    (dev.debug-qp/start-portal!)

    ;; run a query with debugging enabled
    (binding [metabase.query-processor.debug/*debug* true]
      (metabase.query-processor/process-query query)")

(def ^:dynamic *debug*
  "Whether to enable debug tapping."
  false)

(defmacro debug>
  "tap> something for debug purposes if [[*debug*]] is enabled. Body is not evaluated unless debugging is enabled."
  {:style/indent 0}
  [& body]
  #_{:clj-kondo/ignore [:discouraged-var]}
  `(when *debug*
     (when-some [result# (do ~@body)]
       (tap> result#))))

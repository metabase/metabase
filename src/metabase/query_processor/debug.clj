(ns metabase.query-processor.debug)

(comment
  (defn start-portal! []
    ((requiring-resolve 'portal.api/start) {:port 4000})
    (add-tap (requiring-resolve 'portal.api/submit))))

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

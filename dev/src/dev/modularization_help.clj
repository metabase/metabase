(ns src.dev.modularization-help
  (:require
   [clojure.string :as str]))

(defn potemkin-ns!
  "Call this inside a namespace to gather the public vars, sort them, and return them as a vector, usually this is
  exactly what you put into potemkin's `import-vars`."
  [& [nns]]
  (let [nns (or nns *ns*)
        ns-symbol (symbol (str nns))]
    (into [(symbol (last (str/split (str ns-symbol) #"\.")))]
          (sort (keys (ns-publics ns-symbol))))))

(comment
  (src.dev.modularization-help/potemkin-ns!)
  ;; => [modularization-help potemkin-ns!]

  (src.dev.modularization-help/potemkin-ns! *ns*)
  ;; => [modularization-help potemkin-ns!]

  (src.dev.modularization-help/potemkin-ns! (find-ns 'metabase.analytics.stats))
  ;; => [stats
  ;;     csv-upload-version-availability
  ;;     ee-snowplow-features-data
  ;;     environment-type
  ;;     legacy-anonymous-usage-stats
  ;;     m->kv-vec
  ;;     phone-home-stats!]
  )

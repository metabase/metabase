(ns metabase.util.memory)

(set! *warn-on-reflection* true)

(defn total-memory
  "Get total memory in bytes"
  []
  (.totalMemory (Runtime/getRuntime)))

(defn free-memory
  "Get free memory in bytes."
  []
  (.freeMemory (Runtime/getRuntime)))

(defn pretty-usage-str
  "Return pretty string with memory usage."
  []
  (let [free (free-memory)
        total (total-memory)]
    (format "free: %.2fG, total: %.2fG, ratio: %.2f"
            (/ free 1e9)
            (/ total 1e9)
            (double (/ free total)))))

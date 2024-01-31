(ns metabase-enterprise.llm.util)

(defn remove-nil-vals
  "Utility function to remove nil values from a map. If all values are nil, returns nil."
  [m]
  (let [m' (reduce-kv
             (fn [acc k v]
               (cond-> acc
                 (some? v)
                 (assoc k v)))
             {}
             m)]
    (when (seq m') m')))

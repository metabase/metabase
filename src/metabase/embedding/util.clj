(ns metabase.embedding.util
  "Utility functions for public links and embedding.")

(defn maybe-populate-initially-published-at
  "Populate `initially_published_at` if embedding is set to true"
  [{:keys [enable_embedding initially_published_at] :as card-or-dashboard}]
  (cond-> card-or-dashboard
    (and (true? enable_embedding) (nil? initially_published_at))
    (assoc :initially_published_at :%now)))

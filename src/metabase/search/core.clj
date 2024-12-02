(ns metabase.search.core
  (:require
   [metabase.search.appdb.core :as search.engines.appdb]
   [metabase.search.engine :as search.engine]
   [metabase.search.in-place.legacy :as search.legacy]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.spec :as search.spec]
   [metabase.search.util :as search.util]
   [potemkin :as p]))

;; Import the engine implementations
(comment
  search.engines.appdb/keep-me
  search.legacy/keep-me)

(p/import-vars
 search.ingestion/process-next-batch!)

(defn supports-index?
  "Does this instance support a search index, of any sort?"
  []
  (seq (search.engine/active-engines)))

(defn init-index!
  "Ensure there is an index ready to be populated."
  [& {:as opts}]
  ;; If there are multiple indexes, return the peak inserted for each type. In practice, they should all be the same.
  (reduce (partial merge-with max)
          nil
          (for [e (search.engine/active-engines)]
            (search.engine/init! e opts))))

(defn reindex!
  "Populate a new index, and make it active. Simultaneously updates the current index."
  []
  ;; If there are multiple indexes, return the peak inserted for each type. In practice, they should all be the same.
  (reduce (partial merge-with max)
          nil
          (for [e (search.engine/active-engines)]
            (search.engine/reindex! e))))

(defn reset-tracking!
  "Stop tracking the current indexes. Used when resetting the appdb."
  []
  (doseq [e (search.engine/active-engines)]
    (search.engine/reset-tracking! e)))

(defn update!
  "Given a new or updated instance, put all the corresponding search entries if needed in the queue."
  [instance & [always?]]
  (when (supports-index?)
    (when-let [updates (->> (search.spec/search-models-to-update instance always?)
                            (remove (comp search.util/impossible-condition? second))
                            seq)]
      ;; We need to delay execution to handle deletes, which alert us *before* updating the database.
      (search.ingestion/ingest-maybe-async! updates))))

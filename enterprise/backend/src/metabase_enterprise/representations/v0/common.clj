(ns metabase-enterprise.representations.v0.common
  (:require
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn generate-entity-id
  "Generate a stable entity-id from the representation's collection-ref and its own ref."
  [representation]
  ;; Behold the beauty of this mechanism!
  ;; A bit hacky.
  ;; TODO: raw `:collection` key could be fragile; use name?
  (-> (str (:collection representation) "/" (:ref representation))
      hash
      str
      u/generate-nano-id))

(defn find-database-id
  "Find database ID by name or ref. Returns nil if not found."
  [database-ref]
  (when database-ref
    (or
     (when (integer? database-ref) database-ref)
     ;; Try to find by name
     (t2/select-one-pk :model/Database :name database-ref))))

(defn find-collection-id
  "Find collection ID by name or ref. Returns nil if not found."
  [collection-ref]
  (when collection-ref
    (or
     (when (integer? collection-ref) collection-ref)
     ;; Try to find by slug or name
     (t2/select-one-pk :model/Collection :slug collection-ref)
     (t2/select-one-pk :model/Collection :name collection-ref))))

(defn representation->dataset-query
  "Returns Metabase's dataset_query format, given a representation.
   For POC, we're focusing on native SQL queries."
  [{:keys [query mbql_query database] :as representation}]
  (let [database-id (find-database-id database)]
    (cond
      ;; Native SQL query - simple case for POC
      query
      {:type :native
       :native {:query query}
       :database database-id}

      ;; STUB:
      ;; MBQL query - use serdes/import-mbql if it's already in MBQL format
      mbql_query
      (try
        (serdes/import-mbql mbql_query)
        (catch Exception e
          ;; Fall back to simple structure if import fails
          (merge {:type :query
                  :database database-id}
                 mbql_query)))

      :else
      (throw (ex-info "Question must have either 'query' or 'mbql_query'"
                      {:representation representation})))))

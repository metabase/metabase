;; The interface encapsulating the various search engine backends.
(ns metabase.search.engine)

(defmulti supported-engine?
  "Does this instance support the given engine?"
  {:arglists '([engine])}
  identity)

(defmethod supported-engine? :default [engine]
  (throw (ex-info (format "Unknown search engine: %s" engine)
                  {:engine engine})))

(defmulti results
  "Return a reducible of the search result matching a given query."
  {:arglists '([search-context])}
  :search-engine)

(defmulti model-set
  "Return a set of the models which have at least one result for the given query."
  {:arglists '([search-context])}
  :search-engine)

(defmulti score
  "Computes (or extracts) the score from the search result.
Returns a map with :result and :score keys."
  {:arglists '([search-context result])}
  (fn [{engine :search-engine} _]
    engine))

;; Default implementation assumes the :score is already present on the result map.
(defmethod score :default
  [_search-ctx result]
  {:result (dissoc result :score)
   :score  (:score result)})

(defmulti update!
  "Updates the engine's existing index by consuming the documents from the given reducible.
  Returns a map of the number of documents indexed in each model"
  {:arglists '([search-engine document-reducible])}
  (fn [search-engine _document-reducible]
    search-engine))

(defmulti delete!
  "Removes the documents from the engine's index.
  Returns a map of the number of documents deleted in each model"
  {:arglists '([search-engine model ids])}
  (fn [search-engine _model _ids]
    search-engine))

(defmulti init!
  "Ensure that engine is ready to take search queries.
   Returns a map of the number of documents indexed in each model"
  {:arglists '([engine opts])}
  (fn [engine _opts]
    engine))

(defmulti reindex!
  "Perform a full refresh of the engine's index."
  {:arglists '([engine opts])}
  (fn [engine _opts] engine))

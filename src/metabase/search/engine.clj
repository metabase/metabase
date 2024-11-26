;; The interface encapsulating the various search engine backends.
(ns metabase.search.engine
  (:require [metabase.config :as config]))

(defmulti supported-engine?
  "Does this instance support the given engine?"
  identity)

(defmulti results
  "Return a reducible of the search result matching a given query."
  :search-engine)

(defmulti model-set
  "Return a set of the models which have at least one result for the given query."
  :search-engine)

(defmulti score "For legacy search: perform the in-memory ranking"
  (fn [{engine :search-engine} _]
    engine))

(defmethod score :default [_search-ctx result]
  {:result (dissoc result :score)
   :score  (:score result)})

(defmulti consume!
  "Updates the search index by consuming the documents from the given reducible."
  (fn [search-engine _document-reducible]
    search-engine))

(defmulti init!
  "Ensure that the search index exists, an is ready to take search queries."
  (fn [engine _opts]
    engine))

(defmulti reindex!
  "Perform a full refresh of the given engine's index."
  (fn [engine] engine))

(defmulti reset-tracking!
  "Stop tracking the current indexes. Used when resetting the appdb."
  (fn [engine] engine))

(defn active-engines
  "List the search engines that are supported. Does not mention the legacy in-place engine."
  []
  (for [[k p] (dissoc (methods supported-engine?) :search.engine/in-place) :when (p k)] k))

(defn known-engine?
  "Is the given engine recognized?"
  [engine]
  (let [registered? #(contains? (methods supported-engine?) %)]
    (some registered? (cons engine (ancestors engine)))))

(defn default-engine
  "In the absence of an explicit engine argument in a request, which engine should be used?"
  []
  (if config/is-test?
    ;; The API tests have not yet been ported to reflect the new search's results.
    :search.engine/in-place
    (first (filter supported-engine? [:search.engine/fulltext :search.engine/in-place]))))

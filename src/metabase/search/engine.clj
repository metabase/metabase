;; The interface encapsulating the various search engine backends.
(ns metabase.search.engine
  (:require
   [metabase.search.settings :as settings]))

(def ^:private default-engine-precedence
  "In the absence of explicit configuration, these are the engines to try using, in decreasing order of preference."
  [:search.engine/semantic
   :search.engine/appdb
   :search.engine/in-place])

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

(defmulti score "For legacy search: perform the in-memory ranking"
  {:arglists '([search-context result])}
  (fn [{engine :search-engine} _]
    engine))

(defmethod score :default [_search-ctx result]
  {:result (dissoc result :score)
   :score  (:score result)})

(defmulti update!
  "Updates the existing search index by consuming the documents from the given reducible.
  Returns a map of the number of documents indexed in each model"
  {:arglists '([search-engine document-reducible])}
  (fn [search-engine _document-reducible]
    search-engine))

(defmulti delete!
  "Removes the documents from the search index.
  Returns a map of the number of documents deleted in each model"
  {:arglists '([search-engine model ids])}
  (fn [search-engine _model _ids]
    search-engine))

(defmulti init!
  "Ensure that the search index exists, and is ready to take search queries.
   Returns a map of the number of documents indexed in each model"
  {:arglists '([engine opts])}
  (fn [engine _opts]
    engine))

(defmulti reindex!
  "Perform a full refresh of the given engine's index."
  {:arglists '([engine opts])}
  (fn [engine _opts] engine))

(defmulti reset-tracking!
  "Stop tracking the current indexes. Used when resetting the appdb."
  {:arglists '([engine])}
  identity)

(defn known-engines
  "List the possible search engines defined for this version, whether this instance supports them or not."
  []
  ;; If we end up with more "abstract" nodes, we may want a better way to filter them out.
  (keys (dissoc (methods supported-engine?) :default)))

(defn supported-engines
  "List the search engines that are supported, in order of usage preference.
   The configured engine comes first, if it is supported."
  []
  (let [configured-engine (some->> (settings/search-engine) name (keyword "search.engine"))
        potential-engines (cond->> default-engine-precedence configured-engine (cons configured-engine))]
    (distinct (filter supported-engine? potential-engines))))

(defn active-engines
  "A list of supported search engines for which we will maintain an index, in order of usage preference.
   Excludes :search.engine/in-place, which does not use an index."
  []
  (remove #{:search.engine/in-place} (supported-engines)))

(defn known-engine?
  "Is the given engine recognized?"
  [engine]
  (let [registered? #(contains? (methods supported-engine?) %)]
    (some registered? (cons engine (ancestors engine)))))

(defmulti disjunction
  "Given multiple terms to search for, reduce this to a search expression that matches any of them in a single search.
   If this is not possible, return a list of terms to be searched for separately."
  {:arglists '([search-engine terms])}
  (fn [search-engine _terms] search-engine))

(defn default-engine
  "In the absence of an explicit engine argument in a request, which engine should be used?"
  []
  ;; TODO (Chris 2025-11-07) It would be good to have a warning on start up whenever this is *not* what's configured.
  (first (supported-engines)))

(defmethod disjunction :default [_ terms] terms)

(defmethod disjunction nil [_ terms]
  (disjunction (default-engine) terms))

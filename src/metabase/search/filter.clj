(ns metabase.search.filter
  "Namespace that defines the filters that are applied to the search results.

  There are required filters and optional filters.
  Archived is an required filters and is always applied, the reason because by default we want to hide archived/inactive entities.

  But there are OPTIONAL FILTERS like :created-by, :created-at, when these filters are provided, the results will return only
  results of models that have these filters.

  The multi method for optional filters should have the default implementation to throw for unsupported models, and then each model
  that supports the filter should define its own method for the filter."
  (:require
   [clojure.set :as set]
   [honey.sql.helpers :as sql.helpers]
   [metabase.search.config :as search.config :refer [SearchableModel SearchContext]]
   [metabase.util.malli :as mu]))

(def ^:private true-clause [:inline [:= 1 1]])
(def ^:private false-clause [:inline [:= 0 1]])

;; ------------------------------------------------------------------------------------------------;;
;;                                         Required Filters                                         ;
;; ------------------------------------------------------------------------------------------------;;

(defmulti archived-clause
  "Clause to filter by the archived status of the entity."
  {:arglists '([model archived?])}
  (fn [model _] model))

(defmethod archived-clause :default
  [model archived?]
  [:= (search.config/column-with-model-alias model :archived) archived?])

;; Databases can't be archived
(defmethod archived-clause "database"
  [_model archived?]
  (if archived?
    false-clause
    true-clause))

(defmethod archived-clause "indexed-entity"
  [_model archived?]
  (if-not archived?
    true-clause
    false-clause))

;; Table has an `:active` flag, but no `:archived` flag; never return inactive Tables
(defmethod archived-clause "table"
  [model archived?]
  (if archived?
    false-clause                        ; No tables should appear in archive searches
    [:and
     [:= (search.config/column-with-model-alias model :active) true]
     [:= (search.config/column-with-model-alias model :visibility_type) nil]]))

;; ------------------------------------------------------------------------------------------------;;
;;                                         Optional filters                                        ;;
;; ------------------------------------------------------------------------------------------------;;

(defmulti ^:private optional-filter-clause
  "Clause for optional filters.
  Dispath with an array of [filter model-name]."
  {:arglists '([model fitler filter-value])}
  (fn [filter model _filter-value]
    [filter model]))

(defmethod optional-filter-clause :default
  [filter model _creator-id]
  (throw (ex-info (format "%s filter for %s is not supported" filter model) {:filter filter :model model})))

;; Created by filters
(defmethod optional-filter-clause [:created-by "card"]
  [_filter model creator-id]
  [:= (search.config/column-with-model-alias model :creator_id) creator-id])

(defmethod optional-filter-clause [:created-by "dataset"]
  [_filter model creator-id]
  [:= (search.config/column-with-model-alias model :creator_id) creator-id])

(defmethod optional-filter-clause [:created-by "dashboard"]
  [_filter model creator-id]
  [:= (search.config/column-with-model-alias model :creator_id) creator-id])

(defmethod optional-filter-clause [:created-by "action"]
  [_filter model creator-id]
  [:= (search.config/column-with-model-alias model :creator_id) creator-id])

(defn ^:private feature->supported-models
  "Return A map of filter to its support models.

  E.g: {:created-by #{\"card\" \"dataset\" \"dashboard\" \"action\"}}

  This is function instead of a def so that optional-filter-clause can be defined anywhere in the codebase."
  []
  (->> (dissoc (methods optional-filter-clause) :default)
       keys
       (reduce (fn [acc [filter model]]
                 (update acc filter set/union #{model}))
               {})))

;; ------------------------------------------------------------------------------------------------;;
;;                                        Public functions                                         ;;
;; ------------------------------------------------------------------------------------------------;;

(mu/defn search-context->applicable-models :- [:set SearchableModel]
  "Given a search-context, retuns the list of models that can be applied to it.

  If the context has optional filters, the models will be restricted for the set of supported models only."
  [{:keys [created-by models] :as _search-context} :- SearchContext]
  (cond-> models
    (some? created-by) (set/intersection (:created-by (feature->supported-models)))))

(defn- build-optional-filters
  [model {:keys [created-by] :as _search-context}]
  (cond-> []
    (int? created-by) (conj (optional-filter-clause :created-by model created-by))))

(mu/defn build-filters
  "Build the search filters for a model."
  [honeysql-query :- :any
   model          :- SearchableModel
   search-context :- SearchContext]
  (let [{:keys [archived?]} search-context
        archived-filter  (archived-clause model archived?)
        optional-filters (build-optional-filters model search-context)]
    (cond-> honeysql-query
      (seq archived-filter)
      (sql.helpers/where archived-filter)

      (seq optional-filters)
      (sql.helpers/where optional-filters))))

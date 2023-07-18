(ns metabase.search.filter
  "Namespace that define the filters that are applied to the search results.
  There are required filters and optional filters.

  Archived is an required filters and is always applied, the reason because by default we want to hide archived entities.

  But there are OPTIONAL FILTERS like :created-by, :created-at, when these filters are provided, the results will return only
  results of models that have these filters.

  The multi method for optional filters should have the default implementation return a false-clause, and then each model
  that supports the filter should define its own method for the filter.
  "
  (:require
   [metabase.search.config :as search-config]))

(def ^:private true-clause [:inline [:= 1 1]])
(def ^:private false-clause [:inline [:= 0 1]])

(defn ^:private model->alias
  [model]
  (-> model search-config/model-to-db-model :alias))

(defn- model-column-alias
  [model-string column-string]
  (keyword (name (model->alias model-string)) column-string))

;; ------------------------------------------------------------------------------------------------;;
;;                                         Required Filters                                         ;
;; ------------------------------------------------------------------------------------------------;;

(defmulti archived-where-clause
  "Clause to filter by the archived status of the entity."
  {:arglists '([model archived?])}
  (fn [model _] model))

(defmethod archived-where-clause :default
  [model archived?]
  [:= (model-column-alias model "archived") archived?])

;; Databases can't be archived
(defmethod archived-where-clause "database"
  [_model archived?]
  (if archived?
    false-clause
    true-clause))

(defmethod archived-where-clause "indexed-entity"
  [_model archived?]
  (if-not archived?
    true-clause
    false-clause))

;; Table has an `:active` flag, but no `:archived` flag; never return inactive Tables
(defmethod archived-where-clause "table"
  [model archived?]
  (if archived?
    false-clause                        ; No tables should appear in archive searches
    [:and
     [:= (model-column-alias model "active") true]
     [:= (model-column-alias model "visibility_type") nil]]))

;; ------------------------------------------------------------------------------------------------;;
;;                                         Optional filters                                        ;;
;; ------------------------------------------------------------------------------------------------;;

(defmulti created-by-where-clause
  "Clause to filter by the creator of the entity."
  {:arglists '([model creator-id])}
  (fn [model creator-id]
    (assert (int? creator-id) "creator-id must be an integer")
    model))

(defmethod created-by-where-clause :default
  [_model _creator-id]
  false-clause)

(defmethod created-by-where-clause "card"
  [model creator-id]
  [:= (model-column-alias model "creator_id") creator-id])

(defmethod created-by-where-clause "dataset"
  [model creator-id]
  [:= (model-column-alias model "creator_id") creator-id])

(defmethod created-by-where-clause "dashboard"
  [model creator-id]
  [:= (model-column-alias model "creator_id") creator-id])

(defmethod created-by-where-clause "action"
  [model creator-id]
  [:= (model-column-alias model "creator_id") creator-id])

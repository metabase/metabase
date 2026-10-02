(ns metabase.search.in-place.search-model
  "Per-search-model facts shared by the in-place engine's namespaces.

  These live here rather than in [[metabase.search.in-place.legacy]] because
  [[metabase.search.in-place.filter]] and [[metabase.search.in-place.scoring]] both need them, and `legacy` reads
  those two namespaces."
  (:require
   [clojure.string :as str]))

(defn search-model->revision-model
  "Return the appropriate revision model given a search model."
  [model]
  (case model
    "dataset" (recur "card")
    "metric" (recur "card")
    (str/capitalize model)))

(defmulti searchable-columns
  "The columns that can be searched for each model."
  {:arglists '([model search-native-query])}
  (fn [model _] model))

(defmethod searchable-columns :default
  [_ _]
  [:name])

(defmethod searchable-columns "action"
  [_ search-native-query]
  (cond-> [:name
           :description]
    search-native-query
    (conj :dataset_query)))

(defmethod searchable-columns "card"
  [_ search-native-query]
  (cond-> [:name
           :description]
    search-native-query
    (conj :dataset_query)))

(defmethod searchable-columns "dataset"
  [_ search-native-query]
  (searchable-columns "card" search-native-query))

(defmethod searchable-columns "measure"
  [_ _]
  [:name
   :description])

(defmethod searchable-columns "metric"
  [_ search-native-query]
  (searchable-columns "card" search-native-query))

(defmethod searchable-columns "dashboard"
  [_ _]
  [:name
   :description])

(defmethod searchable-columns "page"
  [_ search-native-query]
  (searchable-columns "dashboard" search-native-query))

(defmethod searchable-columns "database"
  [_ _]
  [:name
   :description])

(defmethod searchable-columns "table"
  [_ _]
  [:name
   :display_name
   :description])

(defmethod searchable-columns "transform"
  [_ search-native-query]
  (cond-> [:name
           :description]
    search-native-query
    (conj :source)))

(defmethod searchable-columns "indexed-entity"
  [_ _]
  [:name])

(defmethod searchable-columns "document"
  [_ _]
  [:name
   :document])

;; mirrors the appdb spec's :search-terms [:name :description] (see
;; metabase.explorations.models.exploration)
(defmethod searchable-columns "exploration"
  [_ _]
  [:name
   :description])

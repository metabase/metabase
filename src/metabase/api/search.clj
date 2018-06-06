(ns metabase.api.search
  (:require [clojure.string :as str]
            [compojure.core :refer [GET]]
            [honeysql.helpers :as h]
            [metabase.api.common :refer [*current-user-permissions-set* check-403 defendpoint define-routes]]
            [metabase.models
             [card :refer [Card]]
             [collection :as coll :refer [Collection]]
             [dashboard :refer [Dashboard]]
             [metric :refer [Metric]]
             [pulse :refer [Pulse]]
             [segment :refer [Segment]]]
            [metabase.util
             [honeysql-extensions :as hx]
             [schema :as su]]
            [schema.core :as s]
            [toucan.db :as db]))

(def ^:private search-columns-without-type
  "The columns found in search query clauses except type. Type is added automatically"
  [:name :description :id])

(def ^:private SearchContext
  "Map with the various allowed search parameters, used to construct the SQL query"
  {:search-string       su/NonBlankString
   :archived?           s/Bool
   :collection          (s/maybe su/IntGreaterThanZero)
   :visible-collections coll/VisibleCollections})

(defn- merge-search-select
  "The search query uses a `union-all` which requires that there be the same number of columns in each of the segments
  of the query. This function will take `entity-columns` and will inject constant `nil` values for any column missing
  from `entity-columns` but found in `search-columns`"
  [query-map entity-type entity-columns]
  (let [entity-column-set (set entity-columns)
        cols-or-nils      (for [search-col search-columns-without-type]
                            (if (contains? entity-column-set search-col)
                              search-col
                              [nil search-col]))]
    (apply h/merge-select query-map (concat cols-or-nils [[(hx/literal entity-type) :type]]))))

(s/defn ^:private merge-name-search
  "Add case-insensitive name query criteria to `query-map`"
  [query-map {:keys [search-string]} :- SearchContext]
  (h/merge-where query-map [:like :%lower.name search-string]))

(s/defn ^:private merge-name-and-archived-search
  "Add name and archived query criteria to `query-map`"
  [query-map {:keys [search-string archived?] :as search-ctx} :- SearchContext]
  (-> query-map
      (merge-name-search search-ctx)
      (h/merge-where [:= :archived archived?])))

(s/defn ^:private add-collection-criteria
  "Update the query to only include collections the user has access to"
  [query-map column-kwd {:keys [visible-collections collection]} :- SearchContext]
  (cond
    collection
    (h/merge-where query-map [:= column-kwd collection])

    (= :all visible-collections)
    query-map

    :else
    (do
      ;; This is validated in the API call, just double checking here
      (assert (seq visible-collections))
      (h/merge-where query-map [:in column-kwd visible-collections]))))

(defn- make-honeysql-search-query
  "Create a HoneySQL query map to search for `entity`, suitable for the UNION ALL used in search."
  [entity search-type projected-columns]
  (-> {}
      (merge-search-select search-type projected-columns)
      (h/merge-from entity)))

(defmulti ^:private create-search-query (fn [entity search-context] entity))

(s/defmethod ^:private create-search-query :card
  [_ search-ctx :- SearchContext]
  (-> (make-honeysql-search-query Card "card" search-columns-without-type)
      (merge-name-and-archived-search search-ctx)
      (add-collection-criteria :collection_id search-ctx)))

(s/defmethod ^:private create-search-query :collection
  [_ {:keys [collection] :as search-ctx} :- SearchContext]
  ;; If we have a collection, no need to search collections
  (when-not collection
    (-> (make-honeysql-search-query Collection "collection" search-columns-without-type)
        (merge-name-and-archived-search search-ctx)
        (add-collection-criteria :id search-ctx))))

(s/defmethod ^:private create-search-query :dashboard
  [_ search-ctx :- SearchContext]
  (-> (make-honeysql-search-query Dashboard "dashboard" search-columns-without-type)
      (merge-name-and-archived-search search-ctx)
      (add-collection-criteria :collection_id search-ctx)))

(s/defmethod ^:private create-search-query :pulse
  [_ {:keys [archived?] :as search-ctx} :- SearchContext]
  ;; Pulses don't currently support being archived, omit if archived is true
  (when-not archived?
    (-> (make-honeysql-search-query Pulse "pulse" [:name :id])
        (merge-name-search search-ctx)
        (add-collection-criteria :collection_id search-ctx))))

(s/defmethod ^:private create-search-query :metric
  [_ {:keys [collection] :as search-ctx} :- SearchContext]
  (when-not collection
    (-> (make-honeysql-search-query Metric "metric" search-columns-without-type)
        (merge-name-and-archived-search search-ctx))))

(s/defmethod ^:private create-search-query :segment
  [_ {:keys [collection] :as search-ctx} :- SearchContext]
  (when-not collection
    (-> (make-honeysql-search-query Segment "segment" search-columns-without-type)
        (merge-name-and-archived-search search-ctx))))

(s/defn ^:private search
  "Builds a search query that includes all of the searchable entities and runs it"
  [{:keys [collection visible-collections] :as search-ctx} :- SearchContext]
  ;; If searching for a collection you don't have access to, no need to run a query
  (if (and collection
           (not= :all visible-collections)
           (not (contains? visible-collections collection)))
    []
    (db/query {:union-all (for [entity [:card :collection :dashboard :pulse :segment :metric]
                                :let [query-map (create-search-query entity search-ctx)]
                                :when query-map]
                            query-map)})))

(s/defn ^:private make-search-context :- SearchContext
  [search-string :- su/NonBlankString
   archived-string :- (s/maybe su/BooleanString)
   collection-id :- (s/maybe su/IntGreaterThanZero)]
  {:search-string       (str "%" (str/lower-case search-string) "%")
   :archived?           (Boolean/parseBoolean archived-string)
   :collection          collection-id
   :visible-collections (coll/permissions-set->visible-collection-ids @*current-user-permissions-set*)})

(defendpoint GET "/"
  "Search Cards, Dashboards, Collections and Pulses for the substring `q`."
  [q archived collection_id]
  {q             su/NonBlankString
   archived      (s/maybe su/BooleanString)
   collection_id (s/maybe su/IntGreaterThanZero)}
  (let [{:keys [visible-collections collection] :as search-ctx} (make-search-context q archived collection_id)]
    ;; Throw if the user doesn't have access to any collections
    (check-403 (or (= :all visible-collections)
                   (seq visible-collections)))
    (search search-ctx)))

(define-routes)

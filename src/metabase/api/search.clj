(ns metabase.api.search
  (:require [clojure.string :as str]
            [compojure.core :refer [GET]]
            [honeysql.helpers :as h]
            [metabase.api.common :refer [*current-user-id* *current-user-permissions-set* check-403 defendpoint define-routes]]
            [metabase.models
             [card :refer [Card]]
             [card-favorite :refer [CardFavorite]]
             [collection :as coll :refer [Collection]]
             [dashboard :refer [Dashboard]]
             [dashboard-favorite :refer [DashboardFavorite]]
             [metric :refer [Metric]]
             [pulse :refer [Pulse]]
             [segment :refer [Segment]]]
            [metabase.util :as u]
            [metabase.util
             [honeysql-extensions :as hx]
             [schema :as su]]
            [schema.core :as s]
            [toucan.db :as db]))

(def ^:private default-columns
  [:id :name :description :archived])

(def ^:private card-columns-without-type
  (concat default-columns
          [:collection_id :collection_position [:card_fav.id :favorited]]))

(def ^:private dashboard-columns-without-type
  (concat default-columns
          [:collection_id :collection_position [:dashboard_fav.id :favorited]]))

(def ^:private pulse-columns-without-type
  [:id :name :collection_id])

(def ^:private collection-columns-without-type
  (concat default-columns
          [[:id :collection_id]]))

(def ^:private segment-columns-without-type
  default-columns)

(def ^:private metric-columns-without-type
  default-columns)

(defn- ->column
  "Returns the column name. If the column is aliased, i.e. [`:original_namd` `:aliased_name`], return the aliased
  column name"
  [column-or-aliased]
  (if (sequential? column-or-aliased)
    (second column-or-aliased)
    column-or-aliased))

(def ^:private search-columns-without-type
  "The columns found in search query clauses except type. Type is added automatically"
  (set (map ->column (concat card-columns-without-type
                             dashboard-columns-without-type
                             pulse-columns-without-type
                             collection-columns-without-type
                             segment-columns-without-type
                             metric-columns-without-type))))

(def ^:private SearchContext
  "Map with the various allowed search parameters, used to construct the SQL query"
  {:search-string       (s/maybe su/NonBlankString)
   :archived?           s/Bool
   :collection          (s/maybe (s/cond-pre (s/eq :root) su/IntGreaterThanZero))
   :visible-collections coll/VisibleCollections})

(defn- make-canonical-columns
  "Returns a seq of canonicalized list of columns for the search query with the given `entity-type`. Will return
  column names prefixed with the `entity-type` name so that it can be used in criteria. Projects a nil for columns the
  `entity-type` doesn't have and doesn't modify aliases."
  [entity-type col-name->columns]
  (concat (for [search-col search-columns-without-type
                :let [maybe-aliased-col (get col-name->columns search-col)]]
            (cond
              ;; This is an aliased column, no need to include the table alias
              (sequential? maybe-aliased-col)
              maybe-aliased-col

              ;; This is a column reference, need to add the table alias to the column
              maybe-aliased-col
              (keyword (str entity-type "." (name maybe-aliased-col)))

              ;; This entity is missing the column, project a null for that column value
              :else
              [nil search-col]))
          [[(hx/literal entity-type) :type]]))

(defn- merge-search-select
  "The search query uses a `union-all` which requires that there be the same number of columns in each of the segments
  of the query. This function will take `entity-columns` and will inject constant `nil` values for any column missing
  from `entity-columns` but found in `search-columns`"
  [query-map entity-type entity-columns]
  (let [col-name->column (u/key-by ->column entity-columns)
        cols-or-nils     (make-canonical-columns entity-type col-name->column)]
    (apply h/merge-select query-map (concat cols-or-nils ))))

(s/defn ^:private merge-name-search
  "Add case-insensitive name query criteria to `query-map`"
  [query-map {:keys [search-string]} :- SearchContext]
  (if (empty? search-string)
    query-map
    (h/merge-where query-map [:like :%lower.name (str "%" (str/lower-case search-string) "%")])))

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
    ;; The root collection is the same as a nil collection id
    (= :root collection)
    (h/merge-where query-map [:= column-kwd nil])

    (number? collection)
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
      (h/merge-from [entity (keyword search-type)])))

(defmulti ^:private create-search-query (fn [entity search-context] entity))

(s/defmethod ^:private create-search-query :question
  [_ search-ctx :- SearchContext]
  (-> (make-honeysql-search-query Card "card" card-columns-without-type)
      (h/left-join [(-> (h/select :id :card_id)
                        (h/merge-from CardFavorite)
                        (h/merge-where [:= :owner_id *current-user-id*]))
                    :card_fav]
                   [:= :card.id :card_fav.card_id])
      (merge-name-and-archived-search search-ctx)
      (add-collection-criteria :collection_id search-ctx)))

(s/defmethod ^:private create-search-query :collection
  [_ {:keys [collection] :as search-ctx} :- SearchContext]
  ;; If we have a collection, no need to search collections
  (when-not collection
    (-> (make-honeysql-search-query Collection "collection" collection-columns-without-type)
        (merge-name-and-archived-search search-ctx)
        (add-collection-criteria :id search-ctx))))

(s/defmethod ^:private create-search-query :dashboard
  [_ search-ctx :- SearchContext]
  (-> (make-honeysql-search-query Dashboard "dashboard" dashboard-columns-without-type)
      (h/left-join [(-> (h/select :id :dashboard_id)
                        (h/merge-from DashboardFavorite)
                        (h/merge-where [:= :user_id *current-user-id*]))
                    :dashboard_fav]
                   [:= :dashboard.id :dashboard_fav.dashboard_id])
      (merge-name-and-archived-search search-ctx)
      (add-collection-criteria :collection_id search-ctx)))

(s/defmethod ^:private create-search-query :pulse
  [_ {:keys [archived?] :as search-ctx} :- SearchContext]
  ;; Pulses don't currently support being archived, omit if archived is true
  (when-not archived?
    (-> (make-honeysql-search-query Pulse "pulse" pulse-columns-without-type)
        (merge-name-search search-ctx)
        (add-collection-criteria :collection_id search-ctx))))

(s/defmethod ^:private create-search-query :metric
  [_ {:keys [collection] :as search-ctx} :- SearchContext]
  (when-not collection
    (-> (make-honeysql-search-query Metric "metric" metric-columns-without-type)
        (merge-name-and-archived-search search-ctx))))

(s/defmethod ^:private create-search-query :segment
  [_ {:keys [collection] :as search-ctx} :- SearchContext]
  (when-not collection
    (-> (make-honeysql-search-query Segment "segment" segment-columns-without-type)
        (merge-name-and-archived-search search-ctx))))

(defn- favorited->boolean [row]
  (if-let [fav-value (get row :favorited)]
    (assoc row :favorited (and (integer? fav-value)
                               (not (zero? fav-value))))
    row))

(s/defn ^:private search
  "Builds a search query that includes all of the searchable entities and runs it"
  [{:keys [collection visible-collections] :as search-ctx} :- SearchContext]
  ;; If searching for a collection you don't have access to, no need to run a query
  (if (and collection
           (not= :root collection)
           (not= :all visible-collections)
           (not (contains? visible-collections collection)))
    []
    (map favorited->boolean
         (db/query {:union-all (for [entity [:question :collection :dashboard :pulse :segment :metric]
                                     :let [query-map (create-search-query entity search-ctx)]
                                     :when query-map]
                                 query-map)}))))

(def ^:private CollectionSearchParam
  "Search parameters that can either be a `collection_id`, but in string form, or `root`"
  (s/maybe (s/cond-pre (s/eq "root") su/IntString)))

(s/defn ^:private make-search-context :- SearchContext
  [search-string :- (s/maybe su/NonBlankString)
   archived-string :- (s/maybe su/BooleanString)
   collection :- CollectionSearchParam]
  {:search-string       search-string
   :archived?           (Boolean/parseBoolean archived-string)
   :collection          (cond
                          (= "root" collection)
                          :root
                          collection
                          (Long/parseLong collection)
                          :else
                          collection)
   :visible-collections (coll/permissions-set->visible-collection-ids @*current-user-permissions-set*)})

(defendpoint GET "/"
  "Search Cards, Dashboards, Collections and Pulses for the substring `q`."
  [q archived collection]
  {q             (s/maybe su/NonBlankString)
   archived      (s/maybe su/BooleanString)
   collection    CollectionSearchParam}
  (let [{:keys [visible-collections collection] :as search-ctx} (make-search-context q archived collection)]
    ;; Throw if the user doesn't have access to any collections
    (check-403 (or (= :all visible-collections)
                   (seq visible-collections)))
    (search search-ctx)))

(define-routes)

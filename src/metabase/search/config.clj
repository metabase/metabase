(ns metabase.search.config
  (:require
   [cheshire.core :as json]
   [clojure.string :as str]
   [flatland.ordered.map :as ordered-map]
   [malli.core :as mc]
   [metabase.models.setting :refer [defsetting]]
   [metabase.permissions.util :as perms.u]
   [metabase.public-settings :as public-settings]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(defsetting search-typeahead-enabled
  (deferred-tru "Enable typeahead search in the {0} navbar?"
                (public-settings/application-name-for-setting-descriptions))
  :type       :boolean
  :default    true
  :visibility :authenticated
  :export?    true
  :audit      :getter)

(def ^:dynamic *db-max-results*
  "Number of raw results to fetch from the database. This number is in place to prevent massive application DB load by
  returning tons of results; this number should probably be adjusted downward once we have UI in place to indicate
  that results are truncated.

  Under normal situations it shouldn't be rebound, but it's dynamic to make unit testing easier."
  1000)

(def ^:const max-filtered-results
  "Number of results to return in an API response"
  1000)

(def ^:const stale-time-in-days
  "Results older than this number of days are all considered to be equally old. In other words, there is a ranking
  bonus for results newer than this (scaled to just how recent they are). c.f. `search.scoring/recency-score`"
  180)

(def ^:const dashboard-count-ceiling
  "Results in more dashboards than this are all considered to be equally popular."
  50)

(def ^:const surrounding-match-context
  "Show this many words of context before/after matches in long search results"
  2)

(def model-to-db-model
  "Mapping from string model to the Toucan model backing it."
  {"action"         {:db-model :model/Action :alias :action}
   "card"           {:db-model :model/Card :alias :card}
   "collection"     {:db-model :model/Collection :alias :collection}
   "dashboard"      {:db-model :model/Dashboard :alias :dashboard}
   "database"       {:db-model :model/Database :alias :database}
   "dataset"        {:db-model :model/Card :alias :card}
   "indexed-entity" {:db-model :model/ModelIndexValue :alias :model-index-value}
   "metric"         {:db-model :model/LegacyMetric :alias :metric}
   "segment"        {:db-model :model/Segment :alias :segment}
   "table"          {:db-model :model/Table :alias :table}})

(def all-models
  "Set of all valid models to search for. "
  (set (keys model-to-db-model)))

(def models-search-order
  "The order of this list influences the order of the results: items earlier in the
  list will be ranked higher."
  ["dashboard" "metric" "segment" "indexed-entity" "card" "dataset" "collection" "table" "action" "database"])

(assert (= all-models (set models-search-order)) "The models search order has to include all models")

(defn search-model->revision-model
  "Return the apporpriate revision model given a search model."
  [model]
  (case model
    "dataset" (recur "card")
    (str/capitalize model)))

(defn model->alias
  "Given a model string returns the model alias"
  [model]
  (-> model model-to-db-model :alias))

(mu/defn column-with-model-alias :- keyword?
  "Given a column and a model name, Return a keyword representing the column with the model alias prepended.

  (column-with-model-alias \"card\" :id) => :card.id)"
  [model-string :- ms/KeywordOrString
   column       :- ms/KeywordOrString]
  (keyword (str (name (model->alias model-string)) "." (name column))))

(def SearchableModel
  "Schema for searchable models"
  (into [:enum] all-models))

(def SearchContext
  "Map with the various allowed search parameters, used to construct the SQL query."
  (mc/schema
   [:map {:closed true}
    [:search-string                                        [:maybe ms/NonBlankString]]
    [:archived?                                            :boolean]
    [:current-user-perms                                   [:set perms.u/PathSchema]]
    [:models                                               [:set SearchableModel]]
    [:filter-items-in-personal-collection {:optional true} [:enum "only" "exclude"]]
    [:created-at                          {:optional true} ms/NonBlankString]
    [:created-by                          {:optional true} [:set {:min 1} ms/PositiveInt]]
    [:last-edited-at                      {:optional true} ms/NonBlankString]
    [:last-edited-by                      {:optional true} [:set {:min 1} ms/PositiveInt]]
    [:table-db-id                         {:optional true} ms/PositiveInt]
    [:limit-int                           {:optional true} ms/Int]
    [:offset-int                          {:optional true} ms/Int]
    [:search-native-query                 {:optional true} true?]
    ;; true to search for verified items only, nil will return all items
    [:verified                            {:optional true} true?]]))


(def all-search-columns
  "All columns that will appear in the search results, and the types of those columns. The generated search query is a
  `UNION ALL` of the queries for each different entity; it looks something like:

    SELECT 'card' AS model, id, cast(NULL AS integer) AS table_id, ...
    FROM report_card
    UNION ALL
    SELECT 'metric' as model, id, table_id, ...
    FROM metric

  Columns that aren't used in any individual query are replaced with `SELECT cast(NULL AS <type>)` statements. (These
  are cast to the appropriate type because Postgres will assume `SELECT NULL` is `TEXT` by default and will refuse to
  `UNION` two columns of two different types.)"
  (ordered-map/ordered-map
   ;; returned for all models. Important to be first for changing model for dataset
   :model               :text
   :id                  :integer
   :name                :text
   :display_name        :text
   :description         :text
   :archived            :boolean
   ;; returned for Card, Dashboard, and Collection
   :collection_id       :integer
   :collection_name     :text
   :collection_type     :text
   :collection_authority_level :text
   ;; returned for Card and Dashboard
   :collection_position :integer
   :creator_id          :integer
   :created_at          :timestamp
   :bookmark            :boolean
   ;; returned for everything except Collection
   :updated_at          :timestamp
   ;; returned for Card only, used for scoring and displays
   :dashboardcard_count :integer
   :last_edited_at      :timestamp
   :last_editor_id      :integer
   :moderated_status    :text
   :display             :text
   ;; returned for Metric and Segment
   :table_id            :integer
   :table_schema        :text
   :table_name          :text
   :table_description   :text
   ;; returned for Metric, Segment, and Action
   :database_id         :integer
   ;; returned for Database and Table
   :initial_sync_status :text
   ;; returned for Action
   :model_id            :integer
   :model_name          :text
   ;; returned for indexed-entity
   :pk_ref              :text
   :model_index_id      :integer
   ;; returned for Card and Action
   :dataset_query       :text))

(def ^:const displayed-columns
  "All of the result components that by default are displayed by the frontend."
  #{:name :display_name :collection_name :description})

(defmulti searchable-columns-for-model
  "The columns that will be searched for the query."
  {:arglists '([model])}
  (fn [model] model))

(defmethod searchable-columns-for-model :default
  [_]
  [:name])

(defmethod searchable-columns-for-model "action"
  [_]
  [:name
   :dataset_query
   :description])

(defmethod searchable-columns-for-model "card"
  [_]
  [:name
   :dataset_query
   :description])

(defmethod searchable-columns-for-model "dataset"
  [_]
  (searchable-columns-for-model "card"))

(defmethod searchable-columns-for-model "dashboard"
  [_]
  [:name
   :description])

(defmethod searchable-columns-for-model "page"
  [_]
  (searchable-columns-for-model "dashboard"))

(defmethod searchable-columns-for-model "database"
  [_]
  [:name
   :description])

(defmethod searchable-columns-for-model "table"
  [_]
  [:name
   :display_name
   :description])

(defmethod searchable-columns-for-model "indexed-entity"
  [_]
  [:name])

(def ^:private default-columns
  "Columns returned for all models."
  [:id :name :description :archived :created_at :updated_at])

(def ^:private bookmark-col
  "Case statement to return boolean values of `:bookmark` for Card, Collection and Dashboard."
  [[:case [:not= :bookmark.id nil] true :else false] :bookmark])

(def ^:private dashboardcard-count-col
  "Subselect to get the count of associated DashboardCards"
   [{:select [:%count.*]
     :from   [:report_dashboardcard]
     :where  [:= :report_dashboardcard.card_id :card.id]}
    :dashboardcard_count])

(def ^:private table-columns
  "Columns containing information about the Table this model references. Returned for Metrics and Segments."
  [:table_id
   :created_at
   [:table.db_id       :database_id]
   [:table.schema      :table_schema]
   [:table.name        :table_name]
   [:table.description :table_description]])

(defmulti columns-for-model
  "The columns that will be returned by the query for `model`, excluding `:model`, which is added automatically.
  This is not guaranteed to be the final list of columns, new columns can be added by calling [[api.search/replace-select]]"
  {:arglists '([model])}
  (fn [model] model))

(defmethod columns-for-model "action"
  [_]
  (conj default-columns :model_id
        :creator_id
        [:model.collection_id        :collection_id]
        [:model.id                   :model_id]
        [:model.name                 :model_name]
        [:query_action.database_id   :database_id]
        [:query_action.dataset_query :dataset_query]))

(defmethod columns-for-model "card"
  [_]
  (conj default-columns :collection_id :collection_position :dataset_query :display :creator_id
        [:collection.name :collection_name]
        [:collection.authority_level :collection_authority_level]
        bookmark-col dashboardcard-count-col))

(defmethod columns-for-model "indexed-entity" [_]
  [[:model-index-value.name     :name]
   [:model-index-value.model_pk :id]
   [:model-index.pk_ref         :pk_ref]
   [:model-index.id             :model_index_id]
   [:collection.name            :collection_name]
   [:model.collection_id        :collection_id]
   [:model.id                   :model_id]
   [:model.name                 :model_name]
   [:model.database_id          :database_id]])

(defmethod columns-for-model "dashboard"
  [_]
  (conj default-columns :collection_id :collection_position :creator_id bookmark-col
        [:collection.name :collection_name]
        [:collection.authority_level :collection_authority_level]))

(defmethod columns-for-model "database"
  [_]
  [:id :name :description :created_at :updated_at :initial_sync_status])

(defmethod columns-for-model "collection"
  [_]
  (conj (remove #{:updated_at} default-columns)
        [:collection.id :collection_id]
        [:name :collection_name]
        [:type :collection_type]
        [:authority_level :collection_authority_level]
        bookmark-col))

(defmethod columns-for-model "segment"
  [_]
  (concat default-columns table-columns [:creator_id]))

(defmethod columns-for-model "metric"
  [_]
  (concat default-columns table-columns [:creator_id]))

(defmethod columns-for-model "table"
  [_]
  [:id
   :name
   :created_at
   :display_name
   :description
   :updated_at
   :initial_sync_status
   [:id :table_id]
   [:db_id :database_id]
   [:schema :table_schema]
   [:name :table_name]
   [:description :table_description]])

(defmulti column->string
  "Turn a complex column into a string"
  (fn [_column-value model column-name]
    [(keyword model) column-name]))

(defmethod column->string :default
  [value _ _]
  value)

(defmethod column->string [:card :dataset_query]
  [value _ _]
  (let [query (json/parse-string value true)]
    (if (= "native" (:type query))
      (-> query :native :query)
      "")))

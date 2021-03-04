(ns metabase.search.config
  (:require [cheshire.core :as json]
            [clojure.string :as str]
            [honeysql.core :as hsql]
            [metabase.models :refer [Card Collection Dashboard Metric Pulse Segment Table]]))

(def ^:const db-max-results
  "Number of raw results to fetch from the database. This number is in place to prevent massive application DB load by
  returning tons of results; this number should probably be adjusted downward once we have UI in place to indicate
  that results are truncated."
  1000)

(def ^:const max-filtered-results
  "Number of results to return in an API response"
  50)

(def ^:const stale-time-in-days
  "Results older than this number of days are all considered to be equally old. In other words, there is a ranking
  bonus for results newer than this (scaled to just how recent they are). c.f. `search.scoring/recency-score`"
  180)

(def ^:const dashboard-count-ceiling
  "Results in more dashboards than this are all considered to be equally popular."
  50)

(def searchable-models
  "Models that can be searched. The order of this list also influences the order of the results: items earlier in the
  list will be ranked higher."
  [Dashboard Metric Segment Card Collection Table Pulse])

(defn model-name->class
  "Given a model name as a string, return its Class."
  [model-name]
  (Class/forName (format "metabase.models.%s.%sInstance" model-name (str/capitalize model-name))))

(defn- ->class
  [class-or-instance]
  (if (class? class-or-instance)
    class-or-instance
    (class class-or-instance)))

(def ^:const displayed-columns
  "All of the result components that by default are displayed by the frontend."
  #{:name :display_name :collection_name})

(defmulti searchable-columns-for-model
  "The columns that will be searched for the query."
  {:arglists '([model])}
  ->class)

(defmethod searchable-columns-for-model :default
  [_]
  [:name])

(defmethod searchable-columns-for-model (class Card)
  [_]
  [:name
   :dataset_query])

(defmethod searchable-columns-for-model (class Table)
  [_]
  [:name
   :display_name])

(def ^:private default-columns
  "Columns returned for all models."
  [:id :name :description :archived :updated_at])

(def ^:private favorite-col
  "Case statement to return boolean values of `:favorite` for Card and Dashboard."
  [(hsql/call :case [:not= :fave.id nil] true :else false) :favorite])

(def ^:private dashboardcard-count-col
  "Subselect to get the count of associated DashboardCards"
   [{:select [:%count.*]
     :from   [:report_dashboardcard]
     :where  [:= :report_dashboardcard.card_id :card.id]}
    :dashboardcard_count])

(def ^:private table-columns
  "Columns containing information about the Table this model references. Returned for Metrics and Segments."
  [:table_id
   [:table.db_id       :database_id]
   [:table.schema      :table_schema]
   [:table.name        :table_name]
   [:table.description :table_description]])

(defmulti columns-for-model
  "The columns that will be returned by the query for `model`, excluding `:model`, which is added automatically."
  {:arglists '([model])}
  ->class)

(defmethod columns-for-model (class Card)
  [_]
  (conj default-columns :collection_id :collection_position [:collection.name :collection_name] :dataset_query
        favorite-col dashboardcard-count-col))

(defmethod columns-for-model (class Dashboard)
  [_]
  (conj default-columns :collection_id :collection_position [:collection.name :collection_name] favorite-col))

(defmethod columns-for-model (class Pulse)
  [_]
  [:id :name :collection_id [:collection.name :collection_name]])

(defmethod columns-for-model (class Collection)
  [_]
  (conj (remove #{:updated_at} default-columns) [:id :collection_id] [:name :collection_name]))

(defmethod columns-for-model (class Segment)
  [_]
  (into default-columns table-columns))

(defmethod columns-for-model (class Metric)
  [_]
  (into default-columns table-columns))

(defmethod columns-for-model (class Table)
  [_]
  [:id
   :name
   :display_name
   :description
   :updated_at
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

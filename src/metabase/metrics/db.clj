(ns metabase.metrics.db
  "Application database queries for the metrics module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn metric-card-count
  "The number of Cards matching the Honey SQL `where` clause."
  [where]
  (t2/count :model/Card {:where where}))

(defn metric-cards-page
  "Up to `limit` id, name, description, and Collection id rows from `offset` of the Cards matching the Honey SQL
  `where` clause, in name order."
  [where limit offset]
  (t2/select [:model/Card :id :name :description :collection_id]
             {:where    where
              :order-by [[:name :asc]]
              :limit    limit
              :offset   offset}))

(defn hydrate-collection
  "Hydrate `:collection` onto `cards`."
  [cards]
  (t2/hydrate cards :collection))

(defn metric-card
  "The metric Card with `id`, or nil."
  [id]
  (t2/select-one :model/Card :id id :type "metric"))

(defn measure
  "The Measure with `id`, or nil."
  [id]
  (t2/select-one :model/Measure :id id))

(defn metric-cards-for-database
  "The id and dimensions of the metric Cards of the Database with `database-id`."
  [database-id]
  (t2/select [:model/Card :id :dimensions] :type "metric" :database_id database-id))

(defn fields-with-columns
  "The id and `columns` of the Fields with `field-ids`."
  [columns field-ids]
  (t2/select (into [:model/Field :id] columns) :id [:in field-ids]))

(defn field
  "The Field with `field-id`, or nil."
  [field-id]
  (t2/select-one :model/Field :id field-id))

(ns metabase.metrics.db
  "Application database queries for the metrics module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
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

(defn metric-card
  "The metric Card with `id`, or nil."
  [id]
  (t2/select-one :model/Card :id id :type "metric"))

(defn measure
  "The Measure with `id`, or nil."
  [id]
  (t2/select-one :model/Measure :id id))

(defn raw-metric-cards-for-database
  "The id and dimensions of the metric Cards of the Database with `database-id`.

  Selects the `report_card` table directly rather than `:model/Card`: this asks whether dimensions have ever been
  *persisted*, so it has to see the stored column. Going through the model runs the `:card_schema` upgrades, which
  populates missing `:dimensions`."
  [database-id]
  (t2/select [:report_card :id :dimensions] :type "metric" :database_id database-id))

(defn fields-with-columns
  "The id and `columns` of the Fields with `field-ids`."
  [columns field-ids]
  (t2/select (into [:model/Field :id] columns) :id [:in field-ids]))

(defn field
  "The Field with `field-id`, or nil."
  [field-id]
  (t2/select-one :model/Field :id field-id))

(ns metabase.metrics.db
  "Application database queries for the metrics module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn metric-card-count
  "The number of Cards matching the Honey SQL `where` clause."
  [where :- [:maybe vector?]]
  (t2/count :model/Card {:where where}))

(mu/defn metric-cards-page
  "Up to `limit` id, name, description, and Collection id rows from `offset` of the Cards matching the Honey SQL
  `where` clause, in name order."
  [where  :- [:maybe vector?]
   limit  :- ms/PositiveInt
   offset :- ms/IntGreaterThanOrEqualToZero]
  (t2/select [:model/Card :id :name :description :collection_id]
             {:where    where
              :order-by [[:name :asc]]
              :limit    limit
              :offset   offset}))

(mu/defn metric-card
  "The metric Card with `id`, or nil."
  [id :- ::lib.schema.id/card]
  (t2/select-one :model/Card :id id :type "metric"))

(mu/defn measure
  "The Measure with `id`, or nil."
  [id :- ::lib.schema.id/measure]
  (t2/select-one :model/Measure :id id))

(mu/defn metric-cards-for-database
  "The id and dimensions of the metric Cards of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/select [:model/Card :id :dimensions] :type "metric" :database_id database-id))

(mu/defn fields-with-columns
  "The id and `columns` of the Fields with `field-ids`."
  [columns   :- [:sequential :keyword]
   field-ids :- [:set ::lib.schema.id/field]]
  (t2/select (into [:model/Field :id] columns) :id [:in field-ids]))

(mu/defn field
  "The Field with `field-id`, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one :model/Field :id field-id))

(ns metabase.metrics.db
  "Application database queries for the metrics module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [malli.util :as mut]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.measures.schema :as measures.schema]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
   [toucan2.core :as t2]))

(mu/defn metric-card-count :- ms/IntGreaterThanOrEqualToZero
  "The number of Cards matching the Honey SQL `where` clause."
  [where :- [:maybe vector?]]
  (t2/count :model/Card {:where where}))

(mu/defn metric-cards-page :- [:sequential (mut/select-keys ::queries.schema/card [:id :name :description :collection_id])]
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

(mu/defn metric-card :- [:maybe ::queries.schema/card]
  "The metric Card with `id`, or nil."
  [id :- ::lib.schema.id/card]
  (t2/select-one :model/Card :id id :type "metric"))

(mu/defn measure :- [:maybe ::measures.schema/measure]
  "The Measure with `id`, or nil."
  [id :- ::lib.schema.id/measure]
  (t2/select-one :model/Measure :id id))

(mu/defn metric-cards-for-database :- [:sequential (mut/select-keys ::queries.schema/card [:id :dimensions])]
  "The id and dimensions of the metric Cards of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/select [:model/Card :id :dimensions] :type "metric" :database_id database-id))

(mu/defn fields-with-columns :- [:sequential ::warehouse-schema.schema/field]
  "The id and `columns` of the Fields with `field-ids`."
  [columns   :- [:sequential :keyword]
   field-ids :- [:set ::lib.schema.id/field]]
  (t2/select (into [:model/Field :id] columns) :id [:in field-ids]))

(mu/defn field :- [:maybe ::warehouse-schema.schema/field]
  "The Field with `field-id`, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one :model/Field :id field-id))

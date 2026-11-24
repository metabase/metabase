(ns metabase.query-processor.db
  "Application database queries for the query processor module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2]))

(mu/defn table
  "The Table with `table-id`, or nil."
  [table-id :- [:maybe ::lib.schema.id/table]]
  (t2/select-one :model/Table :id table-id))

(mu/defn dashcard-series-exists?
  "Whether the Card with `card-id` is a series of the DashboardCard with `dashcard-id`."
  [card-id     :- [:maybe ::lib.schema.id/card]
   dashcard-id :- [:maybe ::lib.schema.id/dashcard]]
  (t2/exists? :model/DashboardCardSeries :card_id card-id :dashboardcard_id dashcard-id))

(mu/defn resolve-model! :- :keyword
  "Load the namespace of `model`, so that the methods it implements are defined, and return `model`."
  [model :- :keyword]
  (t2/resolve-model model))

(mu/defn card-database-ids
  "The `:id` and `:database_id` of the Cards with `card-ids`."
  [card-ids :- [:set ::lib.schema.id/card]]
  (t2/select [:model/Card :id :database_id] :id [:in card-ids]))

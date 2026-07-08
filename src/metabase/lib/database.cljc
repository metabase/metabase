(ns metabase.lib.database
  (:require
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]))

(mu/defn database-id :- [:maybe ::lib.schema.id/database]
  "Get the Database ID (`:database`) associated with a query. If the query is using
  the [[metabase.lib.schema.id/saved-questions-virtual-database-id]] (used in some situations for queries with a
  `:source-card`)

    {:database -1337}

  we will attempt to resolve the correct Database ID by getting metadata for the source Card and returning its
  `:database-id`; if this is not available for one reason or another this will return `nil`."
  [query :- ::lib.schema/query]
  (when-let [id (:database query)]
    (if (not= id lib.schema.id/saved-questions-virtual-database-id)
      id
      (some-> query lib.metadata.calculation/primary-source-card :database-id))))

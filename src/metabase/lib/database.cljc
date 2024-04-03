(ns metabase.lib.database
  (:require
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

(mu/defn database-id :- [:maybe ::lib.schema.id/database]
  "Get the Database ID (`:database`) associated with a query. If the query is using
  the [[mbql.s/saved-questions-virtual-database-id]] (used in some situations for queries with a `:source-card`)

    {:database -1337}

  we will attempt to resolve the correct Database ID by getting metadata for the source Card and returning its
  `:database-id`; if this is not available for one reason or another this will return `nil`."
  [query :- ::lib.schema/query]
  (when-let [id (:database query)]
    (if (not= id lib.schema.id/saved-questions-virtual-database-id)
      id
      (when-let [source-card-id (lib.util/source-card-id query)]
        (when-let [card-metadata (lib.metadata/card query source-card-id)]
          (:database-id card-metadata))))))

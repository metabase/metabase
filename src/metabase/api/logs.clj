(ns metabase.api.logs
  "/api/logs endpoints.

  These endpoints are meant to be used by admins to download logs before entries are auto-removed after the day limit.

  For example, the `query_execution` table will have entries removed after 30 days by default, and admins may wish to
  keep logs externally for longer than this retention period."
  (:require
   [compojure.core :refer [GET]]
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase.api.common :as api]
   [metabase.db.connection :as mdb.connection]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan.db :as db]))

(mu/defn query-execution-logs
  "Query to fetch the rows within the last number of `days` from the `query_execution` table."
  [days :- ms/IntGreaterThanZero]
  (let [interval (if (= (mdb.connection/db-type) :postgres)
                   [:cast (str days " days") :interval]
                   [:interval [:inline (str days)] :day])
        results  (db/select :query_execution
                            {:order-by [[:started_at :desc]]
                             :where    [:> :started_at [:- [:now] interval]]})]
    results))

(api/defendpoint GET "/query_execution/:days"
  "Fetch rows within last N `:days` from the query_execution logs table.
  Must be a superuser."
  [days]
  {(mc/coerce ms/IntGreaterThanZero days (mtx/string-transformer)) ms/IntGreaterThanZero}
  (let [days (mc/coerce ms/IntGreaterThanZero days (mtx/string-transformer))]
    (api/check-superuser)
    (query-execution-logs days)))

(api/define-routes)

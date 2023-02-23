(ns metabase.api.logs
  (:require
   [compojure.core :refer [GET]]
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase.api.common :as api]
   [metabase.db.connection :as mdb.connection]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan.db :as db]))

(mu/defn query-execution-logs
  [days :- ms/IntGreaterThanZero]
  (let [interval (if (= (mdb.connection/db-type) :postgres)
                   [:cast (str days " days") :interval]
                   [:interval days :days])
        results  (db/select :query_execution
                            {:order-by [[:started_at :desc]]
                             :where    [:> :started_at [:- [:now] interval]]})]
    (if-not (seq results)
      (throw (ex-info (tru "No log data has been fetched.")
                      {:status-code 400}))
      results)))

(api/defendpoint GET "/query_execution/:days"
  "Fetch rows within last N `:days` from the query_execution logs table.
  Must be a superuser."
  [days]
  {(mc/coerce ms/IntGreaterThanZero days (mtx/string-transformer)) ms/IntGreaterThanZero}
  (let [days (mc/coerce ms/IntGreaterThanZero days (mtx/string-transformer))]
    (api/check-superuser)
    (query-execution-logs days)))

(api/define-routes)

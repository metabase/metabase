(ns metabase-enterprise.advanced-config.api.logs
  "/api/logs endpoints.

  These endpoints are meant to be used by admins to download logs before entries are auto-removed after the day limit.

  For example, the `query_execution` table will have entries removed after 30 days by default, and admins may wish to
  keep logs externally for longer than this retention period."
  (:require
   [clojure.string :as str]
   [compojure.core :refer [GET]]
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase.api.common :as api]
   [metabase.db.connection :as mdb.connection]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn query-execution-logs
  "Query to fetch the rows within the specified `month` of `year` from the `query_execution` table."
  [year :- ms/IntGreaterThanZero
   month :- ms/IntGreaterThanZero]
  (let [date-part (fn [part-key part-value]
                    (if (= (mdb.connection/db-type) :postgres)
                      [:= [:date_part [:inline (name part-key)] :started_at] [:inline part-value]]
                      [:= [part-key :started_at] [:inline part-value]]))
        results   (t2/select :query_execution
                             {:order-by [[:started_at :desc]]
                              :where    [:and
                                         (date-part :year year)
                                         (date-part :month month)]})]
    results))

(api/defendpoint GET "/query_execution/:yyyy-mm"
  "Fetch rows for the month specified by `:yyyy-mm` from the query_execution logs table.
  Must be a superuser."
  [yyyy-mm]
  (let [[year month] (map #(mc/coerce ms/IntGreaterThanZero % (mtx/string-transformer)) (str/split yyyy-mm #"\-"))]
    (api/check-superuser)
    (query-execution-logs year month)))

(api/define-routes)

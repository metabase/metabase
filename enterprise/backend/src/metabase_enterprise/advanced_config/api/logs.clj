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
   [metabase.db :as mdb]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn query-execution-logs
  "Query to fetch the rows within the specified `month` of `year` from the `query_execution` table."
  [year :- ms/PositiveInt
   month :- ms/PositiveInt]
  (let [date-part (fn [part-key part-value]
                    (if (= (mdb/db-type) :postgres)
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
  {yyyy-mm (mu/with-api-error-message [:re #"\d{4}-\d{2}"]
             (deferred-tru "Must be a string like 2020-04 or 2222-11."))}
  (let [[year month] (mc/coerce [:tuple
                                 [:int {:title "year" :min 0 :max 9999}]
                                 [:int {:title "month" :min 0 :max 12}]] ; month 0 ???
                                (str/split yyyy-mm #"\-")
                                (mtx/string-transformer))]
    (api/check-superuser)
    (query-execution-logs year month)))

(api/define-routes)

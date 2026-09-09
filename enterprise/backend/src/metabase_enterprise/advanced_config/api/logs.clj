(ns metabase-enterprise.advanced-config.api.logs
  "/api/logs endpoints.

  These endpoints are meant to be used by admins to download logs before entries are auto-removed after the day limit.

  For example, the `query_execution` table will have entries removed after 30 days by default, and admins may wish to
  keep logs externally for longer than this retention period."
  (:require
   [clojure.string :as str]
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase-enterprise.advanced-config.db :as advanced-config.db]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(mu/defn query-execution-logs
  "Query to fetch the rows within the specified `month` of `year` from the `query_execution` table."
  [year :- ms/PositiveInt
   month :- ms/PositiveInt]
  (advanced-config.db/query-executions-in-month year month))

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/query_execution/:yyyy-mm"
  "Fetch rows for the month specified by `:yyyy-mm` from the query_execution logs table.
  Must be a superuser."
  [{:keys [yyyy-mm]} :- [:map
                         [:yyyy-mm (mu/with-api-error-message [:re #"\d{4}-\d{2}"]
                                                              (deferred-tru "Must be a string like 2020-04 or 2222-11."))]]]
  (let [[year month] (mc/coerce [:tuple
                                 [:int {:title "year" :min 0 :max 9999}]
                                 [:int {:title "month" :min 0 :max 12}]] ; month 0 ???
                                (str/split yyyy-mm #"\-")
                                (mtx/string-transformer))]
    (api/check-superuser)
    (query-execution-logs year month)))

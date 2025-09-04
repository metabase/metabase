(ns metabase-enterprise.metabot-v3.core
  "API namespace for the `metabase-enterprise.metabot-v3` module."
  (:require
   [java-time.api :as t]
   [metabase-enterprise.metabot-v3.api]
   [metabase-enterprise.metabot-v3.client]
   [metabase-enterprise.metabot-v3.table-utils]
   [metabase-enterprise.metabot-v3.util]
   [potemkin :as p]
   [toucan2.core :as t2]))

(p/import-vars
 [metabase-enterprise.metabot-v3.api
  routes]
 [metabase-enterprise.metabot-v3.client
  analyze-chart
  analyze-dashboard
  fix-sql
  generate-sql]
 [metabase-enterprise.metabot-v3.table-utils
  database-tables
  used-tables
  schema-sample])

(defn metabot-stats
  "Calculate total Metabot token usage over a window of the the previous UTC day 00:00-23:59"
  []
  (let [yesterday-utc (t/minus (t/offset-date-time (t/zone-offset "+00")) (t/days 1))]
    (t2/select-one [:model/MetabotMessage [:%sum.total :metabot-tokens]]
                   {:where [:= [:cast :created_at :date] [:cast yesterday-utc :date]]})))

(ns metabase.metabot.core
  "API namespace for the `metabase.metabot` module."
  (:require
   [java-time.api :as t]
   [metabase.metabot.api]
   [metabase.metabot.client]
   [metabase.metabot.table-utils]
   [metabase.metabot.util]
   [metabase.premium-features.core :refer [defenterprise]]
   [potemkin :as p]
   [toucan2.core :as t2]))

(p/import-vars
 [metabase.metabot.api
  routes]
 [metabase.metabot.client
  analyze-chart
  analyze-dashboard
  fix-sql
  generate-sql]
 [metabase.metabot.table-utils
  database-tables
  used-tables
  schema-sample])

(defenterprise metabot-stats
  "Calculate total Metabot token usage over a window of the the previous UTC day 00:00-23:59"
  :feature :none
  []
  (let [yesterday-utc (-> (t/offset-date-time (t/zone-offset "+00"))
                          (t/minus (t/days 1)))]
    {:metabot-tokens     (or (t2/select-one-fn :sum
                                               [:model/MetabotMessage [:%sum.total_tokens :sum]]
                                               {:where [:= [:cast :created_at :date] [:cast yesterday-utc :date]]})
                             0)
     :metabot-queries    (t2/select-one-fn :cnt
                                           [:model/MetabotMessage [:%count.id :cnt]]
                                           ;; there are requests from users and responses from ai-service, in theory
                                           ;; counting requests from users should be good enough
                                           :role "user"
                                           {:where [:= [:cast :created_at :date] [:cast yesterday-utc :date]]})
     :metabot-users      (:cnt (t2/query-one {:select [[[:count [:distinct :c.user_id]] :cnt]]
                                              :from   [[:metabot_message :m]]
                                              :join   [[:metabot_conversation :c] [:= :c.id :m.conversation_id]]
                                              :where  [:= [:cast :m.created_at :date] [:cast yesterday-utc :date]]}))
     :metabot-usage-date (str (t/local-date yesterday-utc))}))

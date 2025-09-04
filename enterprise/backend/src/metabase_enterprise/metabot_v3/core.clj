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
    {:metabot-tokens  (t2/select-one-fn :sum
                                        [:model/MetabotMessage [:%sum.total :sum]]
                                        {:where [:= [:cast :created_at :date] [:cast yesterday-utc :date]]})
     :metabot-queries (t2/select-one-fn :cnt
                                        [:model/MetabotMessage [:%count.id :cnt]]
                                        ;; there are requests from users and responses from ai-service, in theory
                                        ;; counting requests from users should be good enough
                                        :role "user"
                                        {:where [:= [:cast :created_at :date] [:cast yesterday-utc :date]]})
     :metabot-users   (:cnt (t2/query-one {:select [[[:count [:distinct :c.user_id]] :cnt]]
                                           :from   [[:metabot_message :m]]
                                           :join   [[:metabot_conversation :c] [:= :c.id :m.conversation_id]]
                                           :where [:= [:cast :m.created_at :date] [:cast yesterday-utc :date]]}))}))

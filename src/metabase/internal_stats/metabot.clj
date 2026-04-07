(ns metabase.internal-stats.metabot
  (:require
   [java-time.api :as t]
   [toucan2.core :as t2]))

(defn metabot-stats
  "Calculate total Metabot token usage over a window of the previous UTC day 00:00-23:59"
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

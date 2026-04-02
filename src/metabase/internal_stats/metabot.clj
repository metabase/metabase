(ns metabase.internal-stats.metabot
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn metabot-stats
  "Calculate total Metabot token usage over a window of the previous UTC day 00:00-23:59"
  []
  (let [yesterday-utc (-> (t/offset-date-time (t/zone-offset "+00"))
                          (t/minus (t/days 1)))
        tokens        (or (t2/select-one-fn :sum
                                            [:model/MetabotMessage [:%sum.total_tokens :sum]]
                                            {:where [:and
                                                     :ai_proxied
                                                     [:= [:cast :created_at :date] [:cast yesterday-utc :date]]
                                                     [:not= :usage nil]]})
                          0)]
    (when (pos? tokens)
      {:metabot-tokens     (long tokens)
       :metabot-usage      (let [usages (t2/select-fn-vec :usage
                                                          [:model/MetabotMessage :usage]
                                                          {:where [:and
                                                                   :ai_proxied
                                                                   [:= [:cast :created_at :date] [:cast yesterday-utc :date]]
                                                                   [:not= :usage nil]]})]
                             (->> (for [usage               usages
                                        [prov-model tokens] usage
                                        :let [k (str/replace (u/qualified-name prov-model) "/" ":")]]
                                    {(str k ":in")  (:prompt tokens)
                                     (str k ":out") (:completion tokens)})
                                  (apply merge-with +)))
       :metabot-queries    (t2/select-one-fn :cnt
                                             [:model/MetabotMessage [:%count.id :cnt]]
                                             ;; there are requests from users and responses from ai-service, in theory
                                             ;; counting requests from users should be good enough
                                             :role "user"
                                             {:where [:and
                                                      :ai_proxied
                                                      [:= [:cast :created_at :date] [:cast yesterday-utc :date]]]})
       :metabot-users      (:cnt (t2/query-one {:select [[[:count [:distinct :c.user_id]] :cnt]]
                                                :from   [[:metabot_message :m]]
                                                :join   [[:metabot_conversation :c] [:= :c.id :m.conversation_id]]
                                                :where  [:and
                                                         :ai_proxied
                                                         [:= [:cast :m.created_at :date] [:cast yesterday-utc :date]]]}))
       :metabot-usage-date (str (t/local-date yesterday-utc))})))

(ns metabase.internal-stats.metabot
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn- usage-by-model
  "Aggregate combined tokens by provider:model for a given UTC date."
  [date-utc]
  (let [usages (t2/select-fn-vec :usage
                                 [:model/MetabotMessage :usage]
                                 {:where [:and
                                          :ai_proxied
                                          [:= [:cast :created_at :date] [:cast date-utc :date]]
                                          [:not= :usage nil]]})]
    (->> (for [usage               usages
               [prov-model tokens] usage
               :let [k (str/replace-first (u/qualified-name prov-model) "/" ":")]]
           {(str k ":tokens") (+ (:prompt tokens) (:completion tokens))})
         (apply merge-with +)
         not-empty)))

(defn metabot-stats
  "Calculate total Metabot token usage over a window of the previous UTC day 00:00-23:59,
   plus rolling usage stats for today."
  []
  (let [today-utc     (t/offset-date-time (t/zone-offset "+00"))
        yesterday-utc (t/minus today-utc (t/days 1))
        tokens        (or (t2/select-one-fn :sum
                                            [:model/MetabotMessage [:%sum.total_tokens :sum]]
                                            {:where [:and
                                                     :ai_proxied
                                                     [:= [:cast :created_at :date] [:cast yesterday-utc :date]]
                                                     [:not= :usage nil]]})
                          0)
        rolling-usage (usage-by-model today-utc)]
    (when (or (pos? tokens) (seq rolling-usage))
      (cond-> {}
        (pos? tokens)
        (merge {:metabot-tokens     (long tokens)
                :metabot-usage      (usage-by-model yesterday-utc)
                :metabot-queries    (t2/select-one-fn :cnt
                                                      [:model/MetabotMessage [:%count.id :cnt]]
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
                :metabot-usage-date (str (t/local-date yesterday-utc))})
        (seq rolling-usage)
        (merge {:metabot-rolling-usage      rolling-usage
                :metabot-rolling-usage-date (str (t/local-date today-utc))})))))

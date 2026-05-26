(ns metabase.internal-stats.metabot
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [toucan2.core :as t2]))

(defn- usage-by-model
  "Aggregate combined tokens by provider:model for a given UTC date."
  [date-utc]
  (let [rows (t2/select [:model/AiUsageLog :model [:%sum.total_tokens :tokens]]
                        {:where    [:and
                                    :ai_proxied
                                    [:= [:cast :created_at :date] [:cast date-utc :date]]]
                         :group-by [:model]})]
    (->> (for [{:keys [model tokens]} rows
               :let [k (-> model
                           (str/replace-first "metabase/" "")
                           (str/replace-first "/" ":"))]]
           {(str k ":tokens") (long tokens)})
         (apply merge-with +)
         not-empty)))

(defn metabot-stats
  "Calculate total Metabot token usage over a window of the previous UTC day 00:00-23:59 plus rolling usage for today.

  Note that the AiUsageLog table is only populated for EE builds, so this will never return data in OSS."
  []
  (let [today-utc     (t/offset-date-time (t/zone-offset "+00"))
        yesterday-utc (t/minus today-utc (t/days 1))
        user-id-expr  [:coalesce :m.user_id :c.user_id]
        tokens        (or (t2/select-one-fn :sum
                                            [:model/AiUsageLog [:%sum.total_tokens :sum]]
                                            {:where [:and
                                                     :ai_proxied
                                                     [:= [:cast :created_at :date] [:cast yesterday-utc :date]]]})
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
                ;; New rows stamp `metabot_message.user_id`; legacy rows fall back
                ;; to `metabot_conversation.user_id` so historical usage doesn't
                ;; disappear until old messages are backfilled.
                :metabot-users      (:cnt (t2/query-one {:select [[[:count [:distinct user-id-expr]] :cnt]]
                                                         :from   [[:metabot_message :m]]
                                                         :join   [[:metabot_conversation :c] [:= :c.id :m.conversation_id]]
                                                         :where  [:and
                                                                  :ai_proxied
                                                                  [:= [:cast :m.created_at :date] [:cast yesterday-utc :date]]]}))
                :metabot-usage-date (str (t/local-date yesterday-utc))})
        (seq rolling-usage)
        (merge {:metabot-rolling-usage      rolling-usage
                :metabot-rolling-usage-date (str (t/local-date today-utc))})))))

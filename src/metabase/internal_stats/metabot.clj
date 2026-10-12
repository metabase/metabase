(ns metabase.internal-stats.metabot
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.internal-stats.db :as internal-stats.db]))

(defn- usage-by-model
  "Aggregate combined tokens by provider:model for a given UTC date."
  [date-utc]
  (let [rows (internal-stats.db/proxied-ai-usage-tokens-by-model date-utc)]
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
        tokens        (or (internal-stats.db/proxied-ai-usage-tokens-on yesterday-utc) 0)
        rolling-usage (usage-by-model today-utc)]
    (when (or (pos? tokens) (seq rolling-usage))
      (cond-> {}
        (pos? tokens)
        (merge {:metabot-tokens     (long tokens)
                :metabot-usage      (usage-by-model yesterday-utc)
                :metabot-queries    (internal-stats.db/proxied-metabot-user-message-count-on yesterday-utc)
                ;; New rows stamp `metabot_message.user_id`; legacy rows fall back
                ;; to `metabot_conversation.user_id` so historical usage doesn't
                ;; disappear until old messages are backfilled.
                :metabot-users      (:cnt (internal-stats.db/proxied-metabot-user-count-on yesterday-utc))
                :metabot-usage-date (str (t/local-date yesterday-utc))})
        (seq rolling-usage)
        (merge {:metabot-rolling-usage      rolling-usage
                :metabot-rolling-usage-date (str (t/local-date today-utc))})))))

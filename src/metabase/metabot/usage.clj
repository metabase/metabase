(ns metabase.metabot.usage
  "Deprecated: use [[metabase.internal-stats.metabot]] instead."
  (:require
   [metabase.internal-stats.metabot :as internal-stats.metabot]))

(defn metabot-stats
  "Calculate total Metabot token usage over a window of the previous UTC day 00:00-23:59.
   Deprecated: use [[metabase.internal-stats.metabot/metabot-stats]] instead."
  {:deprecated "0.56.0"}
  []
  (internal-stats.metabot/metabot-stats))

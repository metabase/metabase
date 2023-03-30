(ns metabase.metabot
  (:require
   [metabase.metabot.settings :as metabot-settings]
   [metabase.metabot.infer-model :as model-finder]
   [metabase.metabot.infer-sql :as sql-generator]
   [metabase.util.log :as log]))

(defn infer-sql [model question]
  (if (metabot-settings/is-metabot-enabled)
    (sql-generator/infer-sql {:model model :user_prompt question})
    (log/warn "Metabot is not enabled")))

(defn infer-model [database question]
  (if (metabot-settings/is-metabot-enabled)
    (model-finder/infer-model {:database database :user_prompt question})
    (log/warn "Metabot is not enabled")))

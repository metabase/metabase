(ns metabase.metabot.models.metabot-used-table
  "Persist which database tables Metabot referenced when generating a query.
   Source cards / models / metrics are recursively expanded to their underlying
   tables by [[metabase.metabot.used-tables]] before insertion."
  (:require
   [metabase.toucan.core :as t2]))

(t2/define-table-name :model/MetabotUsedTable [_model] :metabot_used_table)

(doto :model/MetabotUsedTable
  (derive :metabase/model))

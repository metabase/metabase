(ns metabase.metabot.models.metabot-used-table
  "Persist which database tables Metabot referenced when generating a query.
   Source cards / models / metrics are recursively expanded to their underlying
   tables by [[metabase.metabot.used-tables]] before insertion."
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/MetabotUsedTable [_model] :metabot_used_table)

(doto :model/MetabotUsedTable
  (derive :metabase/model))

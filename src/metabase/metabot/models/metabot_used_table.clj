(ns metabase.metabot.models.metabot-used-table
  "Persist which database tables Metabot referenced when generating a query.
   Source cards / models / metrics are recursively expanded to their underlying
   tables by [[metabase.metabot.used-tables]] before insertion."
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.schema :as metabot.schema]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/MetabotUsedTable [_model] :metabot_used_table)

(doto :model/MetabotUsedTable
  (derive :metabase/model))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-metabot-used-tables!
  "Insert the MetabotUsedTable `rows` in one statement."
  [rows :- [:sequential ::metabot.schema/metabot-used-table.create]]
  (metabot.db/insert-used-tables! rows))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/MetabotUsedTable [_model]
  {:skip? false})

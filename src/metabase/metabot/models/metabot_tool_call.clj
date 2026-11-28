(ns metabase.metabot.models.metabot-tool-call
  "One row per tool call that Metabot ran or skipped: when it was submitted, ran and ended, how it ended, and its
  input and output. [[metabase.metabot.call-records]] is the writer."
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as mdb]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.schema :as metabot.schema]
   [metabase.models.interface :as mi]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/MetabotToolCall [_model] :metabot_tool_call)

(doto :model/MetabotToolCall
  (derive :metabase/model))

(t2/deftransforms :model/MetabotToolCall
  {:input  mi/transform-json
   :output mi/transform-json})

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-metabot-tool-calls! :- [:sequential ::metabot.schema/metabot-tool-call]
  "Record the MetabotToolCall `rows` in one transaction, and return the inserted rows."
  [rows :- [:sequential ::metabot.schema/metabot-tool-call.create]]
  (mdb/create-batched! :model/MetabotToolCall rows {}))

(mu/defn update-metabot-tool-calls! :- :nil
  "Apply `updates`, the id of a MetabotToolCall and the columns to set, in one transaction."
  [updates :- [:sequential ::metabot.schema/metabot-tool-call.update]]
  (mdb/update-batched! :model/MetabotToolCall updates {}))

(mu/defn abort-open-metabot-tool-calls! :- :int
  "Set the MetabotToolCalls of the MetabotMessages with `message-ids` that have no end to `aborted`, ended at
  `finished-at`. Returns the number of rows updated."
  ;; Not `update-metabot-tool-calls!`: the rows are selected by their state, in the statement that changes it, so a call
  ;; that ends between a read and the write keeps its own end.
  [message-ids :- [:sequential ms/PositiveInt]
   finished-at :- ms/TemporalInstant]
  (metabot.db/abort-open-tool-calls! message-ids finished-at))

(mu/defn delete-metabot-tool-calls! :- :nil
  "Delete the MetabotToolCalls with `ids` in one transaction."
  [ids :- [:sequential ms/PositiveInt]]
  (mdb/delete-batched! :model/MetabotToolCall ids {}))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/MetabotToolCall [_model]
  {:skip? false})

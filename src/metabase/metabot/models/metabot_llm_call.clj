(ns metabase.metabot.models.metabot-llm-call
  "One row per attempt of an LLM call that Metabot made: when it ran, how it ended, and what the provider reported.
  [[metabase.metabot.call-records]] is the writer."
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as mdb]
   [metabase.metabot.app-db-copy :as metabot.app-db-copy]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.schema :as metabot.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/MetabotLlmCall [_model] :metabot_llm_call)

(doto :model/MetabotLlmCall
  (derive :metabase/model))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-metabot-llm-calls! :- [:sequential ::metabot.schema/metabot-llm-call]
  "Record the MetabotLlmCall `rows` in one transaction, and return the inserted rows."
  [rows :- [:sequential ::metabot.schema/metabot-llm-call.create]]
  (mdb/create-batched! :model/MetabotLlmCall rows {}))

(mu/defn update-metabot-llm-calls! :- :nil
  "Apply `updates`, the id of a MetabotLlmCall and the columns to set, in one transaction."
  [updates :- [:sequential ::metabot.schema/metabot-llm-call.update]]
  (mdb/update-batched! :model/MetabotLlmCall updates {}))

(mu/defn abort-open-metabot-llm-calls! :- :int
  "Set the MetabotLlmCalls of the MetabotMessages with `message-ids` that have no end to `aborted`, ended at
  `finished-at`. Returns the number of rows updated."
  ;; Not `update-metabot-llm-calls!`: the rows are selected by their state, in the statement that changes it, so a call
  ;; that ends between a read and the write keeps its own end.
  [message-ids :- [:sequential ms/PositiveInt]
   finished-at :- ms/TemporalInstant]
  (metabot.db/abort-open-llm-calls! message-ids finished-at))

(mu/defn delete-metabot-llm-calls! :- :nil
  "Delete the MetabotLlmCalls with `ids` in one transaction."
  [ids :- [:sequential ms/PositiveInt]]
  (mdb/delete-batched! :model/MetabotLlmCall ids {}))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/MetabotLlmCall [_model]
  {:skip?     false
   :transform metabot.app-db-copy/transform-metabot-llm-call})

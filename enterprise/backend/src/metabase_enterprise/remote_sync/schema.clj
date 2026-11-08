(ns metabase-enterprise.remote-sync.schema
  "Malli schemas for remote sync tasks."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::remote-sync-task.outcome
  "The `:outcome` column of a RemoteSyncTask, decoded."
  [:multi {:dispatch :kind}
   ["pulled"       [:map {:closed true}
                    [:kind   [:= "pulled"]]
                    [:count  :int]
                    [:branch [:maybe :string]]]]
   ["pull-skipped" [:map {:closed true}
                    [:kind [:= "pull-skipped"]]]]
   ["pushed"       [:map {:closed true}
                    [:kind   [:= "pushed"]]
                    [:count  :int]
                    [:branch [:maybe :string]]]]
   ["push-skipped" [:map {:closed true}
                    [:kind [:= "push-skipped"]]]]
   ["merged"       [:map {:closed true}
                    [:kind   [:= "merged"]]
                    [:pulled :int]
                    [:pushed :int]
                    [:branch [:maybe :string]]]]
   ;; Conflict outcomes: why a task stopped when the cause is not a collision (its `:conflicts` say what collided).
   ["remote-changed"    [:map {:closed true}
                         [:kind [:= "remote-changed"]]]]
   ["history-rewritten" [:map {:closed true}
                         [:kind [:= "history-rewritten"]]]]])

(mr/def ::remote-sync-task
  "A RemoteSyncTask as selected from the app DB: every column of `:remote_sync_task`."
  [:merge
   ::remote-sync-task.update
   [:map {:closed true}
    [:id                      ms/PositiveInt]]])

(mr/def ::remote-sync-task.update
  "What an update (or insert) of a RemoteSyncTask accepts: every column of `:remote_sync_task` except `id`, all optional."
  [:map {:closed true}
   [:sync_task_type          {:optional true} [:maybe [:or :keyword :string]]]
   [:progress                {:optional true} [:maybe number?]]
   [:cancelled               {:optional true} [:maybe :boolean]]
   [:started_at              {:optional true} [:maybe ms/TemporalInstant]]
   [:ended_at                {:optional true} [:maybe ms/TemporalInstant]]
   [:last_progress_report_at {:optional true} [:maybe ms/TemporalInstant]]
   [:last_heartbeat_at       {:optional true} [:maybe ms/TemporalInstant]]
   [:initiated_by            {:optional true} [:maybe ::lib.schema.id/user]]
   [:error_message           {:optional true} [:maybe :string]]
   [:version                 {:optional true} [:maybe :string]]
   [:conflicts               {:optional true} [:maybe [:or [:sequential :string] [:set :string]]]]
   [:outcome                 {:optional true} [:maybe ::remote-sync-task.outcome]]])

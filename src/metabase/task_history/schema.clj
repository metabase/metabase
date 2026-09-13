(ns metabase.task-history.schema
  "Malli schemas for the task-history module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::task-history.task-details
  "The `:task_details` column of a TaskHistory, decoded."
  :map)

(mr/def ::task-history.log
  "One entry of the `:logs` column of a TaskHistory, decoded."
  :map)

(mr/def ::task-history
  "A TaskHistory as selected from the app DB: every column of `:task_history`."
  [:map {:closed true}
   [:id           ms/PositiveInt]
   [:task         :string]
   [:db_id        [:maybe ::lib.schema.id/database]]
   [:started_at   ms/TemporalInstant]
   [:ended_at     [:maybe ms/TemporalInstant]]
   [:duration     [:maybe :int]]
   [:task_details [:maybe ::task-history.task-details]]
   [:status       [:or :keyword :string]]
   [:run_id       [:maybe ms/PositiveInt]]
   [:logs         [:maybe [:sequential ::task-history.log]]]])

(mr/def ::task-history.update
  "What an update (or insert) of a TaskHistory accepts: every column of `:task_history` except `id`, all optional."
  [:map {:closed true}
   [:task         {:optional true} [:maybe :string]]
   [:db_id        {:optional true} [:maybe ::lib.schema.id/database]]
   [:started_at   {:optional true} [:maybe ms/TemporalInstant]]
   [:ended_at     {:optional true} [:maybe ms/TemporalInstant]]
   [:duration     {:optional true} [:maybe :int]]
   [:task_details {:optional true} [:maybe ::task-history.task-details]]
   [:status       {:optional true} [:maybe [:or :keyword :string]]]
   [:run_id       {:optional true} [:maybe ms/PositiveInt]]
   [:logs         {:optional true} [:maybe [:sequential ::task-history.log]]]])

(mr/def ::task-run
  "A TaskRun as selected from the app DB: every column of `:task_run`."
  [:map {:closed true}
   [:id              ms/PositiveInt]
   [:run_type        [:or :keyword :string]]
   [:entity_type     [:or :keyword :string]]
   [:entity_id       ms/PositiveInt]
   [:started_at      ms/TemporalInstant]
   [:ended_at        [:maybe ms/TemporalInstant]]
   [:status          [:or :keyword :string]]
   [:process_uuid    :string]
   [:updated_at      ms/TemporalInstant]
   [:notification_id [:maybe ms/PositiveInt]]])

(mr/def ::task-run.update
  "What an update (or insert) of a TaskRun accepts: every column of `:task_run` except `id`, all optional."
  [:map {:closed true}
   [:run_type        {:optional true} [:maybe [:or :keyword :string]]]
   [:entity_type     {:optional true} [:maybe [:or :keyword :string]]]
   [:entity_id       {:optional true} [:maybe ms/PositiveInt]]
   [:started_at      {:optional true} [:maybe ms/TemporalInstant]]
   [:ended_at        {:optional true} [:maybe ms/TemporalInstant]]
   [:status          {:optional true} [:maybe [:or :keyword :string]]]
   [:process_uuid    {:optional true} [:maybe :string]]
   [:updated_at      {:optional true} [:maybe ms/TemporalInstant]]
   [:notification_id {:optional true} [:maybe ms/PositiveInt]]])

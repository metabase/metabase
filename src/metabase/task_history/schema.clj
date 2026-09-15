(ns metabase.task-history.schema
  "Malli schemas for the task-history module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::task-details.channel-send
  [:map {:closed true}
   [:retry_config      {:optional true} [:map {:closed true}
                                         [:max-retries             :int]
                                         [:initial-interval-millis :int]
                                         [:multiplier              number?]
                                         [:jitter-factor           number?]
                                         [:max-interval-millis     :int]]]
   [:channel_id        {:optional true} [:maybe ms/PositiveInt]]
   [:channel_type      {:optional true} :keyword]
   [:template_id       {:optional true} [:maybe ms/PositiveInt]]
   [:notification_id   {:optional true} [:maybe ms/PositiveInt]]
   [:notification_type {:optional true} :keyword]
   [:recipient_ids     {:optional true} [:sequential ms/PositiveInt]]
   [:attempted_retries {:optional true} :int]
   [:retry_errors      {:optional true} [:sequential :string]]])

(mr/def ::task-details.notification-send
  [:map {:closed true}
   [:notification_id       [:maybe ms/PositiveInt]]
   [:notification_handlers [:sequential [:map {:closed true}
                                         [:id           {:optional true} [:maybe ms/PositiveInt]]
                                         [:channel_type {:optional true} [:maybe :keyword]]
                                         [:channel_id   {:optional true} [:maybe ms/PositiveInt]]
                                         [:template_id  {:optional true} [:maybe ms/PositiveInt]]]]]])

(mr/def ::task-details.notification-trigger
  [:map {:closed true}
   [:trigger_type                 [:enum :notification-subscription/cron :notification-subscription/system-event]]
   [:notification_ids             [:sequential ms/PositiveInt]]
   [:notification_subscription_id {:optional true} ms/PositiveInt]
   [:cron_schedule                {:optional true} [:maybe :string]]
   [:event_name                   {:optional true} :keyword]])

(mr/def ::task-details.send-pulse
  [:map {:closed true}
   [:pulse-id    ms/PositiveInt]
   [:channel-ids [:maybe [:sequential ms/PositiveInt]]]])

(mr/def ::task-details.run-transforms
  [:map {:closed true}
   [:job-id          ms/PositiveInt]
   [:run-method      [:= :cron]]
   [:skipped-reason  {:optional true} :string]])

(mr/def ::task-details.remote-sync-auto-import
  [:map {:closed true}
   [:task-id ms/PositiveInt]])

(mr/def ::task-details.persist-refresh
  [:map {:closed true}
   [:success       :int]
   [:error         :int]
   [:skipped       {:optional true} :int]
   [:trigger       {:optional true} :string]
   [:error-details {:optional true} [:sequential [:map {:closed true}
                                                  [:persisted-info-id ms/PositiveInt]
                                                  [:error {:optional true} [:maybe :string]]]]]])

(mr/def ::task-details.sync-step
  "The `:task_details` of a sync/analyze step: the union of the count/diagnostic keys any step
  (`metabase.sync.util/run-step-with-metadata`) can report."
  [:map {:closed true}
   [:version                {:optional true} [:maybe :string]]
   [:timezone-id            {:optional true} [:maybe :string]]
   [:total-tables           {:optional true} :int]
   [:updated-tables         {:optional true} :int]
   [:tables-classified      {:optional true} :int]
   [:total-fields           {:optional true} :int]
   [:updated-fields         {:optional true} :int]
   [:fields-classified      {:optional true} :int]
   [:fields-scored          {:optional true} :int]
   [:fields-scanned         {:optional true} :int]
   [:fields-labeled         {:optional true} :int]
   [:fields-failed          {:optional true} :int]
   [:total-fks              {:optional true} :int]
   [:updated-fks            {:optional true} :int]
   [:total-failed           {:optional true} :int]
   [:total-indexes          {:optional true} :int]
   [:added-indexes          {:optional true} :int]
   [:removed-indexes        {:optional true} :int]
   [:fingerprints-attempted {:optional true} :int]
   [:updated-fingerprints   {:optional true} :int]
   [:no-data-fingerprints   {:optional true} :int]
   [:failed-fingerprints    {:optional true} :int]
   [:created                {:optional true} :int]
   [:updated                {:optional true} :int]
   [:deleted                {:optional true} :int]
   [:errors                 {:optional true} :int]
   [:probed                 {:optional true} :int]
   [:queries                {:optional true} :int]
   [:flavor                 {:optional true} [:maybe :string]]
   [:semantic-version       {:optional true} [:sequential :int]]])

(mr/def ::task-details.empty
  [:map {:closed true}])

(mr/def ::task-details.failure
  "The `:task_details` `do-with-task-history` records when the task throws: the caller's own `:task_details` (any
  shape above) nested under `:original-info`, plus the exception."
  [:map {:closed true}
   [:status        [:enum :failed "failed"]]
   [:exception     {:optional true} [:or :string (ms/InstanceOfClass Class)]]
   [:message       {:optional true} [:maybe :string]]
   [:stacktrace    {:optional true} [:maybe [:sequential :string]]]
   [:ex-data       {:optional true} [:maybe ms/ExceptionData]]
   [:original-info {:optional true} [:maybe [:ref ::task-history.task-details]]]
   [:reason              {:optional true} :string]
   [:attempted_retries   {:optional true} :int]
   [:retry_errors        {:optional true} [:sequential :string]]])

(mr/def ::task-details.test-or-unknown
  "The `:task_details` of a task not otherwise listed here: the ad-hoc shapes the `with-task-history` unit tests
  give a random task name."
  [:map {:closed true}
   [:id     {:optional true} :int]
   [:result {:optional true} :int]])

(mr/def ::task-history.task-details
  "The `:task_details` column of a TaskHistory, decoded: the union of the shapes recorded for each task name (see
  the `with-task-history` call sites)."
  [:or
   ::task-details.channel-send
   ::task-details.notification-send
   ::task-details.notification-trigger
   ::task-details.send-pulse
   ::task-details.run-transforms
   ::task-details.remote-sync-auto-import
   ::task-details.persist-refresh
   ::task-details.sync-step
   ::task-details.failure
   ::task-details.test-or-unknown
   ::task-details.empty])

(mr/def ::task-history.log.trunc
  "The `:trunc` entry of a [[task-history.log]]: bookkeeping for messages dropped once the in-memory log queue fills
  up."
  [:map {:closed true}
   [:levels          [:map {:closed true}
                      [:trace {:optional true} :int]
                      [:debug {:optional true} :int]
                      [:info  {:optional true} :int]
                      [:warn  {:optional true} :int]
                      [:error {:optional true} :int]
                      [:fatal {:optional true} :int]]]
   [:start-timestamp [:maybe :string]]
   [:last-timestamp  [:maybe :string]]])

(mr/def ::task-history.log
  "One entry of the `:logs` column of a TaskHistory, decoded."
  [:map {:closed true}
   [:level        {:optional true} [:enum :trace :debug :info :warn :error :fatal]]
   [:timestamp    {:optional true} :string]
   [:fqns         {:optional true} :string]
   [:msg          {:optional true} :string]
   [:process_uuid {:optional true} :string]
   [:exception    {:optional true} [:sequential :string]]
   [:trunc        {:optional true} ::task-history.log.trunc]])

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

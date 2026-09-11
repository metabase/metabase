(ns metabase.transforms.schema
  (:require
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::lookback
  "A lookback window: each run re-reads source rows up to `value` `unit`s behind the checkpoint,
  so late-arriving rows older than the watermark still get picked up. Only supported for
  temporal checkpoint columns."
  [:map {:closed true}
   [:value pos-int?]
   [:unit (into [:enum] (map name) (sort u.date/add-units))]])

(mr/def ::checkpoint-strategy
  [:map {:closed true}
   [:type [:= "checkpoint"]]
   [:checkpoint-filter-field-id {:optional true} ::lib.schema.id/field]
   [:lookback {:optional true} [:maybe ::lookback]]])

(mr/def ::source-incremental-strategy
  [:multi {:decode/normalize lib.schema.common/normalize-map-no-kebab-case
           :dispatch         :type}
   ["checkpoint" ::checkpoint-strategy]])

(mr/def ::transform-source
  [:multi {:decode/normalize lib.schema.common/normalize-map-no-kebab-case
           :dispatch         (comp keyword :type)}
   [:query
    [:map {:closed true}
     [:type {:decode/normalize lib.schema.common/normalize-keyword} [:= :query]]
     [:query ::lib-be.schema/maybe-legacy-query]
     [:source-incremental-strategy {:optional true} ::source-incremental-strategy]]]
   [:python
    [:map {:closed true}
     [:source-database {:optional true} :int]
     ;; NB: if source is checkpoint, only one table allowed
     [:source-tables   [:sequential ::transforms-base.u/source-table-entry]]
     [:type {:decode/normalize lib.schema.common/normalize-keyword} [:= :python]]
     [:body :string]
     [:source-incremental-strategy {:optional true} ::source-incremental-strategy]]]])

(mr/def ::append-config
  [:map {:closed true} [:type [:= "append"]]])

(mr/def ::merge-key-column
  "One column of a merge unique key. Carries a resolved `:field-id` when the target column is known,
  degrading to a `:name` ref when the target table doesn't exist yet (mirrors `::source-table-entry`)."
  [:map {:closed true}
   [:name {:optional true} ms/NonBlankString]
   [:field-id {:optional true} [:maybe ::lib.schema.id/field]]])

(mr/def ::merge-config
  [:map {:closed true}
   [:type [:= "merge"]]
   [:unique-key [:sequential ::merge-key-column]]])

(mr/def ::target-incremental-strategy
  [:multi {:decode/normalize lib.schema.common/normalize-map-no-kebab-case
           :dispatch         :type}
   ["append" ::append-config]
   ["merge"  ::merge-config]])

(mr/def ::table-target
  [:map {:closed true}
   [:database {:optional true} :int]
   [:type [:= "table"]]
   [:schema {:optional true} [:maybe ms/NonBlankString]]
   [:name :string]])

(mr/def ::table-incremental-target
  [:map {:closed true}
   [:database {:optional true} :int]
   [:type [:= "table-incremental"]]
   [:schema {:optional true} [:maybe ms/NonBlankString]]
   [:name :string]
   [:target-incremental-strategy ::target-incremental-strategy]])

(mr/def ::transform-target
  [:multi {:decode/normalize lib.schema.common/normalize-map-no-kebab-case
           :dispatch         :type}
   ["table" ::table-target]
   ["table-incremental" ::table-incremental-target]])

(mr/def ::id pos-int?)

(mr/def ::transform.source
  "The `:source` column of a Transform, decoded."
  :map)

(mr/def ::transform.target
  "The `:target` column of a Transform, decoded."
  :map)

(mr/def ::transform.table-dependency
  "One entry of the `:table_dependencies` column of a Transform, decoded."
  :map)

(mr/def ::transform
  "A Transform as selected from the app DB: every column of `:transform`."
  [:map {:closed true}
   [:id                    ::lib.schema.id/transform]
   [:name                  :string]
   [:description           [:maybe :string]]
   [:source                ::transform.source]
   [:target                ::transform.target]
   [:entity_id             :string]
   [:created_at            ms/TemporalInstant]
   [:updated_at            ms/TemporalInstant]
   [:source_type           [:or :keyword :string]]
   [:creator_id            ::lib.schema.id/user]
   [:source_database_id    [:maybe ::lib.schema.id/database]]
   [:collection_id         [:maybe ::lib.schema.id/collection]]
   [:owner_user_id         [:maybe ::lib.schema.id/user]]
   [:owner_email           [:maybe :string]]
   [:target_db_id          [:maybe ::lib.schema.id/database]]
   [:last_checkpoint_value [:maybe :string]]
   [:target_table_id       [:maybe ::lib.schema.id/table]]
   [:table_dependencies    [:maybe [:sequential ::transform.table-dependency]]]])

(mr/def ::transform.update
  "What an update (or insert) of a Transform accepts: every column of `:transform` except `id`, all optional, plus `:run_trigger` consumed by the model's hooks."
  [:map {:closed true}
   [:name                  {:optional true} [:maybe :string]]
   [:description           {:optional true} [:maybe :string]]
   [:source                {:optional true} [:maybe ::transform.source]]
   [:target                {:optional true} [:maybe ::transform.target]]
   [:entity_id             {:optional true} [:maybe :string]]
   [:created_at            {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at            {:optional true} [:maybe ms/TemporalInstant]]
   [:source_type           {:optional true} [:maybe [:or :keyword :string]]]
   [:creator_id            {:optional true} [:maybe ::lib.schema.id/user]]
   [:source_database_id    {:optional true} [:maybe ::lib.schema.id/database]]
   [:collection_id         {:optional true} [:maybe ::lib.schema.id/collection]]
   [:owner_user_id         {:optional true} [:maybe ::lib.schema.id/user]]
   [:owner_email           {:optional true} [:maybe :string]]
   [:target_db_id          {:optional true} [:maybe ::lib.schema.id/database]]
   [:last_checkpoint_value {:optional true} [:maybe :string]]
   [:target_table_id       {:optional true} [:maybe ::lib.schema.id/table]]
   [:table_dependencies    {:optional true} [:maybe [:sequential ::transform.table-dependency]]]
   [:run_trigger           {:optional true} [:maybe [:or :keyword :string]]]])

(mr/def ::transform-dag-run
  "A TransformDagRun as selected from the app DB: every column of `:transform_dag_run`."
  [:map {:closed true}
   [:id                         ms/PositiveInt]
   [:source_transform_id        [:maybe ::lib.schema.id/transform]]
   [:source_transform_name      [:maybe :string]]
   [:source_transform_entity_id [:maybe :string]]
   [:direction                  [:or :keyword :string]]
   [:transform_count            [:maybe :int]]
   [:status                     [:or :keyword :string]]
   [:is_active                  [:maybe :boolean]]
   [:start_time                 ms/TemporalInstant]
   [:end_time                   [:maybe ms/TemporalInstant]]
   [:message                    [:maybe :string]]
   [:user_id                    [:maybe ::lib.schema.id/user]]
   [:last_heartbeat             ms/TemporalInstant]
   [:created_at                 ms/TemporalInstant]
   [:updated_at                 ms/TemporalInstant]])

(mr/def ::transform-dag-run.update
  "What an update (or insert) of a TransformDagRun accepts: every column of `:transform_dag_run` except `id`, all optional."
  [:map {:closed true}
   [:source_transform_id        {:optional true} [:maybe ::lib.schema.id/transform]]
   [:source_transform_name      {:optional true} [:maybe :string]]
   [:source_transform_entity_id {:optional true} [:maybe :string]]
   [:direction                  {:optional true} [:maybe [:or :keyword :string]]]
   [:transform_count            {:optional true} [:maybe :int]]
   [:status                     {:optional true} [:maybe [:or :keyword :string]]]
   [:is_active                  {:optional true} [:maybe :boolean]]
   [:start_time                 {:optional true} [:maybe ms/TemporalInstant]]
   [:end_time                   {:optional true} [:maybe ms/TemporalInstant]]
   [:message                    {:optional true} [:maybe :string]]
   [:user_id                    {:optional true} [:maybe ::lib.schema.id/user]]
   [:last_heartbeat             {:optional true} [:maybe ms/TemporalInstant]]
   [:created_at                 {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at                 {:optional true} [:maybe ms/TemporalInstant]]])

(mr/def ::transform-job
  "A TransformJob as selected from the app DB: every column of `:transform_job`."
  [:map {:closed true}
   [:id              ms/PositiveInt]
   [:name            [:or :string mu/localized-string-schema]]
   [:description     [:maybe [:or :string mu/localized-string-schema]]]
   [:schedule        :string]
   [:entity_id       :string]
   [:created_at      ms/TemporalInstant]
   [:updated_at      ms/TemporalInstant]
   [:built_in_type   [:maybe [:or :keyword :string]]]
   [:ui_display_type [:or :keyword :string]]
   [:active          :boolean]])

(mr/def ::transform-job.update
  "What an update (or insert) of a TransformJob accepts: every column of `:transform_job` except `id`, all optional."
  [:map {:closed true}
   [:name            {:optional true} [:maybe [:or :string mu/localized-string-schema]]]
   [:description     {:optional true} [:maybe [:or :string mu/localized-string-schema]]]
   [:schedule        {:optional true} [:maybe :string]]
   [:entity_id       {:optional true} [:maybe :string]]
   [:created_at      {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at      {:optional true} [:maybe ms/TemporalInstant]]
   [:built_in_type   {:optional true} [:maybe [:or :keyword :string]]]
   [:ui_display_type {:optional true} [:maybe [:or :keyword :string]]]
   [:active          {:optional true} [:maybe :boolean]]])

(mr/def ::transform-job-run
  "A TransformJobRun as selected from the app DB: every column of `:transform_job_run`."
  [:map {:closed true}
   [:id             ms/PositiveInt]
   [:job_id         ms/PositiveInt]
   [:run_method     [:or :keyword :string]]
   [:status         [:or :keyword :string]]
   [:is_active      [:maybe :boolean]]
   [:start_time     ms/TemporalInstant]
   [:end_time       [:maybe ms/TemporalInstant]]
   [:message        [:maybe :string]]
   [:created_at     ms/TemporalInstant]
   [:updated_at     ms/TemporalInstant]
   [:last_heartbeat ms/TemporalInstant]
   [:job_name       [:maybe :string]]
   [:job_entity_id  [:maybe :string]]])

(mr/def ::transform-job-run.update
  "What an update (or insert) of a TransformJobRun accepts: every column of `:transform_job_run` except `id`, all optional."
  [:map {:closed true}
   [:job_id         {:optional true} [:maybe ms/PositiveInt]]
   [:run_method     {:optional true} [:maybe [:or :keyword :string]]]
   [:status         {:optional true} [:maybe [:or :keyword :string]]]
   [:is_active      {:optional true} [:maybe :boolean]]
   [:start_time     {:optional true} [:maybe ms/TemporalInstant]]
   [:end_time       {:optional true} [:maybe ms/TemporalInstant]]
   [:message        {:optional true} [:maybe :string]]
   [:created_at     {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at     {:optional true} [:maybe ms/TemporalInstant]]
   [:last_heartbeat {:optional true} [:maybe ms/TemporalInstant]]
   [:job_name       {:optional true} [:maybe :string]]
   [:job_entity_id  {:optional true} [:maybe :string]]])

(mr/def ::transform-job-transform-tag
  "A TransformJobTransformTag as selected from the app DB: every column of `:transform_job_transform_tag`."
  [:map {:closed true}
   [:id        ms/PositiveInt]
   [:job_id    ms/PositiveInt]
   [:tag_id    ms/PositiveInt]
   [:entity_id :string]
   [:position  :int]])

(mr/def ::transform-job-transform-tag.update
  "What an update (or insert) of a TransformJobTransformTag accepts: every column of `:transform_job_transform_tag` except `id`, all optional."
  [:map {:closed true}
   [:job_id    {:optional true} [:maybe ms/PositiveInt]]
   [:tag_id    {:optional true} [:maybe ms/PositiveInt]]
   [:entity_id {:optional true} [:maybe :string]]
   [:position  {:optional true} [:maybe :int]]])

(mr/def ::transform-run
  "A TransformRun as selected from the app DB: every column of `:transform_run`."
  [:map {:closed true}
   [:id                         ms/PositiveInt]
   [:transform_id               [:maybe ::lib.schema.id/transform]]
   [:run_method                 [:or :keyword :string]]
   [:status                     [:or :keyword :string]]
   [:is_active                  [:maybe :boolean]]
   [:start_time                 ms/TemporalInstant]
   [:end_time                   [:maybe ms/TemporalInstant]]
   [:message                    [:maybe :string]]
   [:user_id                    [:maybe ::lib.schema.id/user]]
   [:transform_name             [:maybe :string]]
   [:transform_entity_id        [:maybe :string]]
   [:checkpoint_filter_field_id [:maybe ::lib.schema.id/field]]
   [:checkpoint_lo_value        [:maybe :string]]
   [:checkpoint_hi_value        [:maybe :string]]
   [:metered_as                 [:maybe :string]]
   [:last_heartbeat             ms/TemporalInstant]
   [:job_run_id                 [:maybe ms/PositiveInt]]
   [:dag_run_id                 [:maybe ms/PositiveInt]]])

(mr/def ::transform-run.update
  "What an update (or insert) of a TransformRun accepts: every column of `:transform_run` except `id`, all optional."
  [:map {:closed true}
   [:transform_id               {:optional true} [:maybe ::lib.schema.id/transform]]
   [:run_method                 {:optional true} [:maybe [:or :keyword :string]]]
   [:status                     {:optional true} [:maybe [:or :keyword :string]]]
   [:is_active                  {:optional true} [:maybe :boolean]]
   [:start_time                 {:optional true} [:maybe ms/TemporalInstant]]
   [:end_time                   {:optional true} [:maybe ms/TemporalInstant]]
   [:message                    {:optional true} [:maybe :string]]
   [:user_id                    {:optional true} [:maybe ::lib.schema.id/user]]
   [:transform_name             {:optional true} [:maybe :string]]
   [:transform_entity_id        {:optional true} [:maybe :string]]
   [:checkpoint_filter_field_id {:optional true} [:maybe ::lib.schema.id/field]]
   [:checkpoint_lo_value        {:optional true} [:maybe :string]]
   [:checkpoint_hi_value        {:optional true} [:maybe :string]]
   [:metered_as                 {:optional true} [:maybe :string]]
   [:last_heartbeat             {:optional true} [:maybe ms/TemporalInstant]]
   [:job_run_id                 {:optional true} [:maybe ms/PositiveInt]]
   [:dag_run_id                 {:optional true} [:maybe ms/PositiveInt]]])

(mr/def ::transform-run-cancelation
  "A TransformRunCancelation as selected from the app DB: every column of `:transform_run_cancelation`."
  [:map {:closed true}
   [:run_id ms/PositiveInt]
   [:time   ms/TemporalInstant]])

(mr/def ::transform-run-cancelation.update
  "What an update (or insert) of a TransformRunCancelation accepts: every column of `:transform_run_cancelation` except `id`, all optional."
  [:map {:closed true}
   [:run_id {:optional true} [:maybe ms/PositiveInt]]
   [:time   {:optional true} [:maybe ms/TemporalInstant]]])

(mr/def ::transform-tag
  "A TransformTag as selected from the app DB: every column of `:transform_tag`."
  [:map {:closed true}
   [:id            ms/PositiveInt]
   [:name          [:or :string mu/localized-string-schema]]
   [:entity_id     :string]
   [:created_at    ms/TemporalInstant]
   [:updated_at    ms/TemporalInstant]
   [:built_in_type [:maybe [:or :keyword :string]]]])

(mr/def ::transform-tag.update
  "What an update (or insert) of a TransformTag accepts: every column of `:transform_tag` except `id`, all optional."
  [:map {:closed true}
   [:name          {:optional true} [:maybe [:or :string mu/localized-string-schema]]]
   [:entity_id     {:optional true} [:maybe :string]]
   [:created_at    {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at    {:optional true} [:maybe ms/TemporalInstant]]
   [:built_in_type {:optional true} [:maybe [:or :keyword :string]]]])

(mr/def ::transform-transform-tag
  "A TransformTransformTag as selected from the app DB: every column of `:transform_transform_tag`."
  [:map {:closed true}
   [:id           ms/PositiveInt]
   [:transform_id ::lib.schema.id/transform]
   [:tag_id       ms/PositiveInt]
   [:entity_id    :string]
   [:position     :int]])

(mr/def ::transform-transform-tag.update
  "What an update (or insert) of a TransformTransformTag accepts: every column of `:transform_transform_tag` except `id`, all optional."
  [:map {:closed true}
   [:transform_id {:optional true} [:maybe ::lib.schema.id/transform]]
   [:tag_id       {:optional true} [:maybe ms/PositiveInt]]
   [:entity_id    {:optional true} [:maybe :string]]
   [:position     {:optional true} [:maybe :int]]])

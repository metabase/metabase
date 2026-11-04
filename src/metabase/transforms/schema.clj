(ns metabase.transforms.schema
  (:require
   [metabase.indexes.schema :as indexes.schema]
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
  [:map {:closed true, :decode/normalize lib.schema.common/normalize-map-no-kebab-case}
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

(mr/def ::query-source
  "The `:source` of a query transform: its MBQL 5 query, normalized from legacy MBQL where a client or a serdes export
  still writes it."
  [:map {:closed true}
   [:type {:decode/normalize lib.schema.common/normalize-keyword} [:= :query]]
   [:query ::lib-be.schema/maybe-legacy-query]
   [:source-incremental-strategy {:optional true} ::source-incremental-strategy]])

(mr/def ::python-source
  "The `:source` of a Python transform: its script and the tables it reads."
  [:map {:closed true}
   [:source-database {:optional true} [:maybe :int]]
   ;; NB: if source is checkpoint, only one table allowed
   [:source-tables   {:decode/normalize #(cond-> % (map? %) (-> (update-keys name) transforms-base.u/source-tables-map->vec))}
    [:sequential ::transforms-base.u/source-table-entry]]
   [:type {:decode/normalize lib.schema.common/normalize-keyword} [:= :python]]
   [:body :string]
   [:source-incremental-strategy {:optional true} ::source-incremental-strategy]])

(mr/def ::transform-source
  "The `:source` of a transform, by its `:type`."
  [:multi {:decode/normalize lib.schema.common/normalize-map-no-kebab-case
           :dispatch         (comp keyword :type)}
   [:query  ::query-source]
   [:python ::python-source]])

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
   [:database {:optional true} [:maybe :int]]
   [:type [:= "table"]]
   [:schema {:optional true} [:maybe ms/NonBlankString]]
   [:name :string]])

(mr/def ::table-incremental-target
  [:map {:closed true}
   [:database {:optional true} [:maybe :int]]
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
  ::transform-source)

(mr/def ::transform.target
  "The `:target` column of a Transform, decoded."
  ::transform-target)

(mr/def ::transform.table-dependency
  "One entry of the `:table_dependencies` column of a Transform, decoded."
  :metabase.transforms-base.schema/table-dependency)

(mr/def ::transform.owner
  "The `:owner` hydrated onto a Transform: its owning User, or just the `:email` of an owner outside Metabase."
  [:or
   :metabase.users.schema/user
   [:map {:closed true} [:email :string]]])

(mr/def ::localized-label
  "A user-facing label: a string, or one translated when it is rendered."
  [:or :string mu/localized-string-schema])

(mr/def ::requestable-index-field
  "One form field for requesting an index of some kind, as a driver describes it."
  [:map {:closed true}
   [:name         :string]
   [:display-name ::localized-label]
   [:description  {:optional true} ::localized-label]
   [:type         [:enum :string :boolean :select :integer :columns]]
   [:required     {:optional true} :boolean]
   [:directions   {:optional true} :boolean]
   [:options      {:optional true} [:sequential [:map {:closed true}
                                                 [:name  ::localized-label]
                                                 [:value :string]]]]])

(mr/def ::requestable-index-method
  "One kind of index a Transform's target table can have, as its driver describes it."
  [:map {:closed true}
   [:display-name ::localized-label]
   [:description  {:optional true} ::localized-label]
   [:lifecycle    [:enum :standalone :inline]]
   [:fields       [:sequential ::requestable-index-field]]])

(mr/def ::requestable-indexes
  "The kinds of index a Transform's target table can have, by kind."
  (into [:map {:closed true}]
        (for [kind indexes.schema/index-kinds]
          [kind {:optional true} ::requestable-index-method])))

(mr/def ::transform
  "A Transform as selected from the app DB: every column of `:transform`, plus what callers hydrate onto it or add for
  an API response."
  [:merge
   ::transform.update
   [:map {:closed true}
    [:id                    ::lib.schema.id/transform]
    [:creator               {:optional true} [:maybe :metabase.users.schema/user]]
    [:table                 {:optional true} [:maybe [:ref :metabase.warehouse-schema.schema/table]]]
    [:last_run              {:optional true} [:maybe ::transform-run]]
    [:collection            {:optional true} [:maybe :metabase.collections.schema/collection-or-root]]
    [:owner                 {:optional true} [:maybe ::transform.owner]]
    [:can_read              {:optional true} :boolean]
    [:can_write             {:optional true} :boolean]
    [:can_execute           {:optional true} :boolean]
    [:tag_ids               {:optional true} [:maybe [:sequential ms/PositiveInt]]]
    [:source_readable       {:optional true} :boolean]
    [:requestable_indexes   {:optional true} [:maybe ::requestable-indexes]]]])

(mr/def ::run-trigger
  "What starts a Transform run: nothing, or the global schedule."
  (ms/enum-decode-keyword [:none :global-schedule]))

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
   [:run_trigger           {:optional true} [:maybe ::run-trigger]]])

(mr/def ::transform.definition
  "What a Transform computes and where it writes, as a client writes it."
  [:map {:closed true}
   [:name        :string]
   [:description {:optional true} [:maybe :string]]
   [:source      ::transform-source]
   [:target      ::transform-target]])

(mr/def ::transform-dag-run
  "A TransformDagRun as selected from the app DB: every column of `:transform_dag_run`."
  [:merge
   ::transform-dag-run.update
   [:map {:closed true}
    [:id                         ms/PositiveInt]]])

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
  [:merge
   ::transform-job.update
   [:map {:closed true}
    [:id              ms/PositiveInt]]])

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
  [:merge
   ::transform-job-run.update
   [:map {:closed true}
    [:id             ms/PositiveInt]]])

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
  [:merge
   ::transform-job-transform-tag.update
   [:map {:closed true}
    [:id        ms/PositiveInt]]])

(mr/def ::transform-job-transform-tag.update
  "What an update (or insert) of a TransformJobTransformTag accepts: every column of `:transform_job_transform_tag` except `id`, all optional."
  [:map {:closed true}
   [:job_id    {:optional true} [:maybe ms/PositiveInt]]
   [:tag_id    {:optional true} [:maybe ms/PositiveInt]]
   [:entity_id {:optional true} [:maybe :string]]
   [:position  {:optional true} [:maybe :int]]])

(mr/def ::transform-run
  "A TransformRun as selected from the app DB: every column of `:transform_run`."
  [:merge
   ::transform-run.update
   [:map {:closed true}
    [:id                         ms/PositiveInt]]])

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
  [:merge
   ::transform-run-cancelation.update
   [:map {:closed true}]])

(mr/def ::transform-run-cancelation.update
  "What an update (or insert) of a TransformRunCancelation accepts: every column of `:transform_run_cancelation` except `id`, all optional."
  [:map {:closed true}
   [:run_id {:optional true} [:maybe ms/PositiveInt]]
   [:time   {:optional true} [:maybe ms/TemporalInstant]]])

(mr/def ::transform-tag
  "A TransformTag as selected from the app DB: every column of `:transform_tag`."
  [:merge
   ::transform-tag.update
   [:map {:closed true}
    [:id            ms/PositiveInt]]])

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
  [:merge
   ::transform-transform-tag.update
   [:map {:closed true}
    [:id           ms/PositiveInt]]])

(mr/def ::transform-transform-tag.update
  "What an update (or insert) of a TransformTransformTag accepts: every column of `:transform_transform_tag` except `id`, all optional."
  [:map {:closed true}
   [:transform_id {:optional true} [:maybe ::lib.schema.id/transform]]
   [:tag_id       {:optional true} [:maybe ms/PositiveInt]]
   [:entity_id    {:optional true} [:maybe :string]]
   [:position     {:optional true} [:maybe :int]]])

(mr/def ::coordinated-run-model
  "A model that tracks a coordinated run."
  [:enum :model/TransformJobRun :model/TransformDagRun])

(mr/def ::transform-plan
  "An execution plan: the Transforms in execution order, and the dependencies they were ordered by."
  [:map {:closed true}
   [:order [:sequential ::transform]]
   [:deps  [:map-of ::lib.schema.id/transform [:set ::lib.schema.id/transform]]]])

(mr/def ::promise
  "A promise."
  (ms/InstanceOfClass clojure.lang.IPending))

(mr/def ::transform.create
  "What a client posts to create a Transform: the columns an insert accepts, plus the `:tag_ids` to link."
  [:merge
   ::transform.update
   [:map {:closed true}
    [:tag_ids {:optional true} [:maybe [:sequential ms/PositiveInt]]]]])

(mr/def ::transform-run.presented
  "A TransformRun prepared for an API response: its timestamps are ISO strings in UTC."
  [:merge
   ::transform-run
   [:map {:closed true}
    [:start_time {:optional true} [:maybe :string]]
    [:end_time   {:optional true} [:maybe :string]]]])

(mr/def ::execute-options
  "The options of `transforms.i/execute!`."
  [:map {:closed true}
   [:run-method    {:optional true} [:maybe [:enum :manual :cron]]]
   [:on-start      {:optional true} [:maybe [:=> [:cat ms/PositiveInt] :nil]]]
   [:user-id       {:optional true} [:maybe ::lib.schema.id/user]]
   [:parent-run    {:optional true} [:maybe [:tuple [:enum :job :dag] ms/PositiveInt]]]
   [:start-promise {:optional true} [:maybe ::promise]]])

(mr/def ::run-summary
  "A root run of the paged run listing: a job run, a manual DAG run, or a standalone transform run."
  [:map {:closed true}
   [:run_type        (ms/enum-decode-keyword [:job :dag :transform])]
   [:id              ms/PositiveInt]
   [:entity_id       [:maybe ms/PositiveInt]]
   [:entity_name     [:maybe :string]]
   [:direction       [:maybe (ms/enum-decode-keyword [:upstream :downstream])]]
   [:transform_count [:maybe :int]]
   [:run_method      [:maybe (ms/enum-decode-keyword [:manual :cron])]]
   [:status          (ms/enum-decode-keyword [:started :succeeded :failed :timeout :canceled :canceling])]
   [:is_active       [:maybe :boolean]]
   [:start_time      [:maybe ms/TemporalInstant]]
   [:end_time        {:optional true} [:maybe ms/TemporalInstant]]
   [:message         [:maybe :string]]
   [:user_id         [:maybe ::lib.schema.id/user]]])

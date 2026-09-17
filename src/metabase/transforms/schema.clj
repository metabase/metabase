(ns metabase.transforms.schema
  (:require
   [malli.util :as mut]
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

(mr/def ::orphaned-query
  "The MBQL 5 query of a transform whose source database was deleted, kept as a breadcrumb with its `:database` nulled."
  [:map {:closed true}
   [:lib/type [:= {:decode/normalize lib.schema.common/normalize-keyword} :mbql/query]]
   [:database :nil]
   [:stages   [:ref :metabase.lib.schema/stages]]
   [:lib/metadata {:optional true} [:ref :metabase.lib.schema.metadata/metadata-provider]]])

(mr/def ::transform-source
  [:multi {:decode/normalize lib.schema.common/normalize-map-no-kebab-case
           :dispatch         (comp keyword :type)}
   [:query
    [:map {:closed true}
     [:type {:decode/normalize lib.schema.common/normalize-keyword} [:= :query]]
     [:query [:or
              ::orphaned-query
              ::lib-be.schema/maybe-legacy-query]]
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
  [:or
   [:map {:closed true} [:table ::lib.schema.id/table]]
   [:map {:closed true} [:transform ::lib.schema.id/transform]]])

(mr/def ::transform.owner
  "The `:owner` hydrated onto a Transform: its owning User, or just the `:email` of an owner outside Metabase."
  [:or
   :metabase.users.schema/user
   [:map {:closed true} [:email :string]]])

(mr/def ::transform
  "A Transform as selected from the app DB: every column of `:transform`, plus `:creator`, `:table`, `:last_run`,
  `:collection`, and `:owner` some callers hydrate onto it."
  [:merge
   ::transform.columns
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
    [:tag_ids               {:optional true} [:maybe [:sequential ms/PositiveInt]]]]])

(mr/def ::transform.columns
  "What an update (or insert) of a Transform accepts: every column of `:transform` except `id`, all optional, plus `:run_trigger` consumed by the model's hooks."
  [:map {:closed true}
   [:name                  {:optional true} [:maybe :string]]
   [:description           {:optional true} [:maybe :string]]
   [:source                {:optional true} [:maybe ::transform.source]]
   [:target                {:optional true} [:maybe ::transform.target]]
   [:entity_id             {:optional true} [:maybe :string]]
   [:created_at            {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:updated_at            {:optional true} [:maybe ms/TemporalInstantOrNow]]
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

(mr/def ::transform.partial
  "A Transform row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::transform [:map {:closed true} [:id {:optional true} ::lib.schema.id/transform]]])

(mr/def ::transform.column
  "A column of `transform`, for the `:columns` option of the queries in [[metabase.transforms.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::transform.columns))))

(mr/def ::transform.create
  "What an insert of a Transform accepts."
  (mut/select-keys (mr/schema ::transform.columns)
                   [:name :description :source :target :entity_id :created_at :updated_at :source_type
                    :creator_id :source_database_id :collection_id :owner_user_id :owner_email :target_db_id
                    :last_checkpoint_value :target_table_id :table_dependencies :run_trigger]))

(mr/def ::transform.update
  "What an update of a Transform accepts: no immutable columns (`:entity_id`, `:created_at`, `:creator_id`)."
  (mut/select-keys (mr/schema ::transform.columns)
                   [:name :description :source :target :updated_at :source_type :source_database_id
                    :collection_id :owner_user_id :owner_email :target_db_id :last_checkpoint_value
                    :target_table_id :table_dependencies :run_trigger]))

(mr/def ::transform-dag-run
  "A TransformDagRun as selected from the app DB: every column of `:transform_dag_run`."
  [:merge
   ::transform-dag-run.columns
   [:map {:closed true}
    [:id                         ms/PositiveInt]]])

(mr/def ::transform-dag-run.columns
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
   [:end_time                   {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:message                    {:optional true} [:maybe :string]]
   [:user_id                    {:optional true} [:maybe ::lib.schema.id/user]]
   [:last_heartbeat             {:optional true} [:maybe ms/TemporalInstant]]
   [:created_at                 {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:updated_at                 {:optional true} [:maybe ms/TemporalInstantOrNow]]])

(mr/def ::transform-dag-run.partial
  "A TransformDagRun row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::transform-dag-run [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::transform-dag-run.column
  "A column of `transform_dag_run`, for the `:columns` option of the queries in [[metabase.transforms.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::transform-dag-run.columns))))

(mr/def ::transform-dag-run.create
  "What an insert of a TransformDagRun accepts."
  (mut/select-keys (mr/schema ::transform-dag-run.columns)
                   [:source_transform_id :source_transform_name :source_transform_entity_id :direction
                    :transform_count :status :is_active :start_time :end_time :message :user_id
                    :last_heartbeat :created_at :updated_at]))

(mr/def ::transform-dag-run.update
  "What an update of a TransformDagRun accepts: no immutable columns (`:source_transform_id`,
  `:source_transform_name`, `:source_transform_entity_id`, `:direction`, `:transform_count`, `:user_id`,
  `:created_at`)."
  (mut/select-keys (mr/schema ::transform-dag-run.columns)
                   [:status :is_active :start_time :end_time :message :last_heartbeat :updated_at]))

(mr/def ::transform-job
  "A TransformJob as selected from the app DB: every column of `:transform_job`."
  [:merge
   ::transform-job.columns
   [:map {:closed true}
    [:id              ms/PositiveInt]]])

(mr/def ::transform-job.columns
  "What an update (or insert) of a TransformJob accepts: every column of `:transform_job` except `id`, all optional."
  [:map {:closed true}
   [:name            {:optional true} [:maybe [:or :string mu/localized-string-schema]]]
   [:description     {:optional true} [:maybe [:or :string mu/localized-string-schema]]]
   [:schedule        {:optional true} [:maybe :string]]
   [:entity_id       {:optional true} [:maybe :string]]
   [:created_at      {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:updated_at      {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:built_in_type   {:optional true} [:maybe [:or :keyword :string]]]
   [:ui_display_type {:optional true} [:maybe [:or :keyword :string]]]
   [:active          {:optional true} [:maybe :boolean]]])

(mr/def ::transform-job.partial
  "A TransformJob row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::transform-job [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::transform-job.column
  "A column of `transform_job`, for the `:columns` option of the queries in [[metabase.transforms.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::transform-job.columns))))

(mr/def ::transform-job.create
  "What an insert of a TransformJob accepts."
  (mut/select-keys (mr/schema ::transform-job.columns)
                   [:name :description :schedule :entity_id :created_at :updated_at :built_in_type
                    :ui_display_type :active]))

(mr/def ::transform-job.update
  "What an update of a TransformJob accepts: no immutable columns (`:entity_id`, `:created_at`)."
  (mut/select-keys (mr/schema ::transform-job.columns)
                   [:name :description :schedule :updated_at :built_in_type :ui_display_type :active]))

(mr/def ::transform-job-run
  "A TransformJobRun as selected from the app DB: every column of `:transform_job_run`."
  [:merge
   ::transform-job-run.columns
   [:map {:closed true}
    [:id             ms/PositiveInt]]])

(mr/def ::transform-job-run.columns
  "What an update (or insert) of a TransformJobRun accepts: every column of `:transform_job_run` except `id`, all optional."
  [:map {:closed true}
   [:job_id         {:optional true} [:maybe ms/PositiveInt]]
   [:run_method     {:optional true} [:maybe [:or :keyword :string]]]
   [:status         {:optional true} [:maybe [:or :keyword :string]]]
   [:is_active      {:optional true} [:maybe :boolean]]
   [:start_time     {:optional true} [:maybe ms/TemporalInstant]]
   [:end_time       {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:message        {:optional true} [:maybe :string]]
   [:created_at     {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:updated_at     {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:last_heartbeat {:optional true} [:maybe ms/TemporalInstant]]
   [:job_name       {:optional true} [:maybe :string]]
   [:job_entity_id  {:optional true} [:maybe :string]]])

(mr/def ::transform-job-run.partial
  "A TransformJobRun row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::transform-job-run [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::transform-job-run.column
  "A column of `transform_job_run`, for the `:columns` option of the queries in [[metabase.transforms.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::transform-job-run.columns))))

(mr/def ::transform-job-run.create
  "What an insert of a TransformJobRun accepts."
  (mut/select-keys (mr/schema ::transform-job-run.columns)
                   [:job_id :run_method :status :is_active :start_time :end_time :message :created_at
                    :updated_at :last_heartbeat :job_name :job_entity_id]))

(mr/def ::transform-job-run.update
  "What an update of a TransformJobRun accepts: no immutable columns (`:job_id`, `:job_name`,
  `:job_entity_id`, `:run_method`, `:created_at`)."
  (mut/select-keys (mr/schema ::transform-job-run.columns)
                   [:status :is_active :start_time :end_time :message :updated_at :last_heartbeat]))

(mr/def ::transform-job-transform-tag
  "A TransformJobTransformTag as selected from the app DB: every column of `:transform_job_transform_tag`."
  [:merge
   ::transform-job-transform-tag.columns
   [:map {:closed true}
    [:id        ms/PositiveInt]]])

(mr/def ::transform-job-transform-tag.columns
  "What an update (or insert) of a TransformJobTransformTag accepts: every column of `:transform_job_transform_tag` except `id`, all optional."
  [:map {:closed true}
   [:job_id    {:optional true} [:maybe ms/PositiveInt]]
   [:tag_id    {:optional true} [:maybe ms/PositiveInt]]
   [:entity_id {:optional true} [:maybe :string]]
   [:position  {:optional true} [:maybe :int]]])

(mr/def ::transform-job-transform-tag.partial
  "A TransformJobTransformTag row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::transform-job-transform-tag [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::transform-job-transform-tag.column
  "A column of `transform_job_transform_tag`, for the `:columns` option of the queries in
  [[metabase.transforms.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::transform-job-transform-tag.columns))))

(mr/def ::transform-job-transform-tag.create
  "What an insert of a TransformJobTransformTag accepts."
  (mut/select-keys (mr/schema ::transform-job-transform-tag.columns) [:job_id :tag_id :entity_id :position]))

(mr/def ::transform-job-transform-tag.update
  "What an update of a TransformJobTransformTag accepts: no immutable columns (`:job_id`, `:tag_id`,
  `:entity_id`)."
  (mut/select-keys (mr/schema ::transform-job-transform-tag.columns) [:position]))

(mr/def ::transform-run
  "A TransformRun as selected from the app DB: every column of `:transform_run`."
  [:merge
   ::transform-run.columns
   [:map {:closed true}
    [:id                         ms/PositiveInt]]])

(mr/def ::transform-run.columns
  "What an update (or insert) of a TransformRun accepts: every column of `:transform_run` except `id`, all optional."
  [:map {:closed true}
   [:transform_id               {:optional true} [:maybe ::lib.schema.id/transform]]
   [:run_method                 {:optional true} [:maybe [:or :keyword :string]]]
   [:status                     {:optional true} [:maybe [:or :keyword :string]]]
   [:is_active                  {:optional true} [:maybe :boolean]]
   [:start_time                 {:optional true} [:maybe ms/TemporalInstant]]
   [:end_time                   {:optional true} [:maybe ms/TemporalInstantOrNow]]
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

(mr/def ::transform-run.partial
  "A TransformRun row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::transform-run [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::transform-run.column
  "A column of `transform_run`, for the `:columns` option of the queries in [[metabase.transforms.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::transform-run.columns))))

(mr/def ::transform-run.create
  "What an insert of a TransformRun accepts."
  (mut/select-keys (mr/schema ::transform-run.columns)
                   [:transform_id :run_method :status :is_active :start_time :end_time :message :user_id
                    :transform_name :transform_entity_id :checkpoint_filter_field_id :checkpoint_lo_value
                    :checkpoint_hi_value :metered_as :last_heartbeat :job_run_id :dag_run_id]))

(mr/def ::transform-run.update
  "What an update of a TransformRun accepts: no immutable columns (`:transform_id`, `:run_method`,
  `:user_id`, `:transform_name`, `:transform_entity_id`, `:job_run_id`, `:dag_run_id`)."
  (mut/select-keys (mr/schema ::transform-run.columns)
                   [:status :is_active :start_time :end_time :message :checkpoint_filter_field_id
                    :checkpoint_lo_value :checkpoint_hi_value :metered_as :last_heartbeat]))

(mr/def ::transform-run-cancelation
  "A TransformRunCancelation as selected from the app DB: every column of `:transform_run_cancelation`. Keyed by
  `run_id`; there is no surrogate `:id` column."
  [:merge
   ::transform-run-cancelation.columns
   [:map {:closed true}]])

(mr/def ::transform-run-cancelation.columns
  "What an update (or insert) of a TransformRunCancelation accepts: every column of `:transform_run_cancelation`, all optional."
  [:map {:closed true}
   [:run_id {:optional true} [:maybe ms/PositiveInt]]
   [:time   {:optional true} [:maybe ms/TemporalInstant]]])

(mr/def ::transform-run-cancelation.column
  "A column of `transform_run_cancelation`, for the `:columns` option of the queries in
  [[metabase.transforms.db]]. There is no surrogate `:id` column; the table is keyed by `run_id`."
  (into [:enum] (mut/keys (mr/schema ::transform-run-cancelation.columns))))

(mr/def ::transform-run-cancelation.create
  "What an insert of a TransformRunCancelation accepts."
  (mut/select-keys (mr/schema ::transform-run-cancelation.columns) [:run_id :time]))

(mr/def ::transform-run-cancelation.update
  "What an update of a TransformRunCancelation accepts: no immutable columns (`:run_id`)."
  (mut/select-keys (mr/schema ::transform-run-cancelation.columns) [:time]))

(mr/def ::transform-tag
  "A TransformTag as selected from the app DB: every column of `:transform_tag`."
  [:merge
   ::transform-tag.columns
   [:map {:closed true}
    [:id            ms/PositiveInt]]])

(mr/def ::transform-tag.columns
  "What an update (or insert) of a TransformTag accepts: every column of `:transform_tag` except `id`, all optional."
  [:map {:closed true}
   [:name          {:optional true} [:maybe [:or :string mu/localized-string-schema]]]
   [:entity_id     {:optional true} [:maybe :string]]
   [:created_at    {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:updated_at    {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:built_in_type {:optional true} [:maybe [:or :keyword :string]]]])

(mr/def ::transform-tag.partial
  "A TransformTag row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::transform-tag [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::transform-tag.column
  "A column of `transform_tag`, for the `:columns` option of the queries in [[metabase.transforms.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::transform-tag.columns))))

(mr/def ::transform-tag.create
  "What an insert of a TransformTag accepts."
  (mut/select-keys (mr/schema ::transform-tag.columns) [:name :entity_id :created_at :updated_at :built_in_type]))

(mr/def ::transform-tag.update
  "What an update of a TransformTag accepts: no immutable columns (`:entity_id`, `:created_at`)."
  (mut/select-keys (mr/schema ::transform-tag.columns) [:name :updated_at :built_in_type]))

(mr/def ::transform-transform-tag
  "A TransformTransformTag as selected from the app DB: every column of `:transform_transform_tag`."
  [:merge
   ::transform-transform-tag.columns
   [:map {:closed true}
    [:id           ms/PositiveInt]]])

(mr/def ::transform-transform-tag.columns
  "What an update (or insert) of a TransformTransformTag accepts: every column of `:transform_transform_tag` except `id`, all optional."
  [:map {:closed true}
   [:transform_id {:optional true} [:maybe ::lib.schema.id/transform]]
   [:tag_id       {:optional true} [:maybe ms/PositiveInt]]
   [:entity_id    {:optional true} [:maybe :string]]
   [:position     {:optional true} [:maybe :int]]])

(mr/def ::transform-transform-tag.partial
  "A TransformTransformTag row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::transform-transform-tag [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::transform-transform-tag.column
  "A column of `transform_transform_tag`, for the `:columns` option of the queries in [[metabase.transforms.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::transform-transform-tag.columns))))

(mr/def ::transform-transform-tag.create
  "What an insert of a TransformTransformTag accepts."
  (mut/select-keys (mr/schema ::transform-transform-tag.columns) [:transform_id :tag_id :entity_id :position]))

(mr/def ::transform-transform-tag.update
  "What an update of a TransformTransformTag accepts: no immutable columns (`:transform_id`, `:tag_id`,
  `:entity_id`)."
  (mut/select-keys (mr/schema ::transform-transform-tag.columns) [:position]))

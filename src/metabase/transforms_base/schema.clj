(ns metabase.transforms-base.schema
  "Malli schemas for base transform execution.

   These are the minimal schemas needed for execute-base! and its implementations.
   The full transforms module (metabase.transforms.schema) extends these with
   additional fields like :id (required for scheduled execution)."
  (:require
   [metabase.indexes.schema :as indexes.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms])
  (:import
   (clojure.core.async.impl.channels ManyToManyChannel)
   (clojure.lang Atom)
   (java.time Instant LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime)
   (java.util Date)))

;;; ------------------------------------------------- Primitives -------------------------------------------------

(mr/def ::atom
  (ms/InstanceOfClass Atom))

(mr/def ::chan
  (ms/InstanceOfClass ManyToManyChannel))

;;; ------------------------------------------------- Transform -------------------------------------------------

(mr/def ::temporal
  "A temporal value: a checkpoint column's value or a run's timestamp."
  [:or
   (ms/InstanceOfClass Instant)
   (ms/InstanceOfClass Date)
   (ms/InstanceOfClass LocalDate)
   (ms/InstanceOfClass LocalDateTime)
   (ms/InstanceOfClass LocalTime)
   (ms/InstanceOfClass OffsetDateTime)
   (ms/InstanceOfClass OffsetTime)
   (ms/InstanceOfClass ZonedDateTime)])

(mr/def ::instantable
  "A value that converts to an Instant: a temporal or an ISO-8601 string."
  [:or :string ::temporal])

(mr/def ::column-types
  "The types of a column, as `lib.types.isa` predicates read them: what a Field row carries before it becomes Lib
  metadata."
  [:map {:closed true}
   [:base-type      [:maybe :keyword]]
   [:effective-type [:maybe :keyword]]])

(mr/def ::lookback
  "A lookback window on an incremental source: how far behind the checkpoint each run re-reads."
  [:map {:closed true}
   [:value pos-int?]
   [:unit [:or :string :keyword]]])

(mr/def ::source-incremental-strategy
  "An incremental strategy on a transform's source, as `get-source-range-params` reads it. The full,
  `:type`-dispatched shape (checkpoint/append/merge variants) is owned by `metabase.transforms.schema`;
  this module only reads the checkpoint fields."
  [:map {:closed true}
   [:type {:optional true} [:or :string :keyword]]
   [:checkpoint-filter-field-id {:optional true} ::lib.schema.id/field]
   [:lookback {:optional true} [:maybe ::lookback]]])

(mr/def ::target-incremental-strategy
  "An incremental strategy on a transform's target: append the new rows, or merge them on a unique key."
  [:map {:closed true}
   [:type       [:or :string :keyword]]
   [:unique-key {:optional true} [:sequential [:map {:closed true}
                                               [:name     {:optional true} :string]
                                               [:field-id {:optional true} [:maybe ::lib.schema.id/field]]]]]])

(mr/def ::transform-target
  "Target specification for a transform. Must include at least :type and :name."
  [:map {:closed true}
   [:type [:or :string :keyword]]
   [:database {:optional true} [:maybe :int]]
   [:schema {:optional true} [:maybe :string]]
   [:name :string]
   [:indexes {:optional true} [:sequential ::indexes.schema/index-structured]]
   [:target-incremental-strategy {:optional true} ::target-incremental-strategy]
   [:index-request-ids {:optional true} [:sequential pos-int?]]])

(mr/def ::synced-target
  "A transform target with the columns of the Table that syncing it creates."
  [:merge
   ::transform-target
   [:map {:closed true}
    [:data_authority {:optional true} :keyword]
    [:data_source    {:optional true} :keyword]
    [:is_writable    {:optional true} :boolean]]])

(mr/def ::query-source
  "The `:source` of a query transform."
  [:map {:closed true}
   [:type                        [:enum :query "query"]]
   [:query                       :metabase.lib.schema/query]
   [:source-incremental-strategy {:optional true} [:maybe ::source-incremental-strategy]]])

(mr/def ::python-source
  "The `:source` of a Python transform: its script and the tables it reads."
  [:map {:closed true}
   [:type                        [:enum :python "python"]]
   [:body                        :string]
   [:source-tables               [:sequential :metabase.transforms-base.util/source-table-entry]]
   [:source-database             {:optional true} [:maybe :int]]
   [:source-incremental-strategy {:optional true} [:maybe ::source-incremental-strategy]]])

(mr/def ::transform-source
  "The `:source` of a transform, by its `:type`."
  [:multi {:dispatch (comp keyword :type)}
   [:query  ::query-source]
   [:python ::python-source]])

(mr/def ::table-dependency
  "A logical table dependency of a transform, computed or stored in its `:table_dependencies`; see
  [[metabase.transforms-base.interface/table-dependencies]]."
  [:or
   [:map {:closed true} [:table ::lib.schema.id/table]]
   [:map {:closed true} [:transform ::lib.schema.id/transform]]
   [:map {:closed true} [:table-ref [:map {:closed true}
                                     [:database_id {:optional true} [:maybe :int]]
                                     [:schema      {:optional true} [:maybe :string]]
                                     [:table       :string]]]]])

(mr/def ::transform
  "A transform map as expected by execute-base! implementations. The full transforms module
  (metabase.transforms.schema) hydrates and stores more columns on this same map; they're declared here,
  optional, so that richer value can be threaded through the shared execute-base! machinery unchanged."
  [:map {:closed true}
   [:source ::transform-source]
   [:id {:optional true} pos-int?]
   [:target {:optional true} [:maybe ::transform-target]]
   [:name {:optional true} :string]
   [:description {:optional true} [:maybe :string]]
   [:full-incremental-run? {:optional true} :boolean]
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
   [:table_dependencies    {:optional true} [:maybe [:sequential ::table-dependency]]]
   [:tag_ids               {:optional true} [:maybe [:sequential pos-int?]]]
   [:transform_tag_ids     {:optional true} [:maybe [:sequential pos-int?]]]
   [:creator               {:optional true} [:maybe [:ref :metabase.users.schema/user]]]
   [:table                 {:optional true} [:maybe [:ref :metabase.warehouse-schema.schema/table]]]
   [:last_run              {:optional true} [:maybe [:ref :metabase.transforms.schema/transform-run]]]
   [:collection            {:optional true} [:maybe [:ref :metabase.collections.schema/collection-or-root]]]
   [:owner                 {:optional true} [:maybe [:ref :metabase.transforms.schema/transform.owner]]]
   [:can_read              {:optional true} :boolean]
   [:can_write             {:optional true} :boolean]
   [:can_execute           {:optional true} :boolean]])

;;; ----------------------------------------- Source Range Params -----------------------------------------------

(mr/def ::transform-row
  "A Transform, or the subset of its columns a caller selected, with the heavy `:source` allowed to be absent."
  [:map {:closed true}
   [:source {:optional true} ::transform-source]
   [:id {:optional true} pos-int?]
   [:target {:optional true} [:maybe ::transform-target]]
   [:name {:optional true} :string]
   [:description {:optional true} [:maybe :string]]
   [:full-incremental-run? {:optional true} :boolean]
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
   [:table_dependencies    {:optional true} [:maybe [:sequential ::table-dependency]]]
   [:tag_ids               {:optional true} [:maybe [:sequential pos-int?]]]
   [:transform_tag_ids     {:optional true} [:maybe [:sequential pos-int?]]]
   [:creator               {:optional true} [:maybe [:ref :metabase.users.schema/user]]]
   [:table                 {:optional true} [:maybe [:ref :metabase.warehouse-schema.schema/table]]]
   [:last_run              {:optional true} [:maybe [:ref :metabase.transforms.schema/transform-run]]]
   [:collection            {:optional true} [:maybe [:ref :metabase.collections.schema/collection-or-root]]]
   [:owner                 {:optional true} [:maybe [:ref :metabase.transforms.schema/transform.owner]]]
   [:can_read              {:optional true} :boolean]
   [:can_write             {:optional true} :boolean]
   [:can_execute           {:optional true} :boolean]
   [:deleted {:optional true} :boolean]])

(defn- run-schema
  "A run as the transforms module stores or hydrates it, with its timestamps as `timestamp` schemas."
  [timestamp]
  (let [timestamps [[:start_time     {:optional true} [:maybe timestamp]]
                    [:end_time       {:optional true} [:maybe timestamp]]
                    [:last_heartbeat {:optional true} [:maybe ::instantable]]]]
    [:or
     [:merge :metabase.transforms.schema/transform-run
      (into [:map {:closed true}
             [:transform         {:optional true} [:maybe [:ref ::transform-row]]]
             [:transform_tag_ids {:optional true} [:maybe [:sequential pos-int?]]]]
            timestamps)]
     [:merge :metabase.transforms.schema/transform-job-run (into [:map {:closed true}] timestamps)]
     [:merge :metabase.transforms.schema/transform-dag-run (into [:map {:closed true}] timestamps)]
     [:map {:closed true}
      [:run_type        [:or :string :keyword]]
      [:id              pos-int?]
      [:entity_id       [:maybe pos-int?]]
      [:name            {:optional true} [:maybe [:or :string mu/localized-string-schema]]]
      [:entity_name     {:optional true} [:maybe :string]]
      [:direction       [:maybe [:or :string :keyword]]]
      [:transform_count [:maybe :int]]
      [:run_method      [:maybe [:or :string :keyword]]]
      [:status          [:or :string :keyword]]
      [:is_active       [:maybe :boolean]]
      [:start_time      timestamp]
      [:end_time        {:optional true} [:maybe timestamp]]
      [:message         [:maybe :string]]
      [:user_id         [:maybe pos-int?]]]
     [:map {:closed true} [:start_time timestamp]]]))

(mr/def ::run
  "A transform run, job run, DAG run, or job's next-run summary, with timestamps as the app DB returns them."
  (run-schema ::instantable))

(mr/def ::presented-run
  "A run presented for an API response: its timestamps are ISO-8601 strings."
  (run-schema :string))

(mr/def ::checkpoint-bound
  "A bound (lo or hi) for incremental checkpoint filtering."
  [:map {:closed true}
   [:value [:or number? ms/TemporalInstant]]])

(mr/def ::source-range-params
  "Parameters for incremental range filtering on a source query.
   Returned by get-source-range-params."
  [:map {:closed true}
   [:column ::lib.schema.metadata/column]
   [:checkpoint-filter-field-id ::lib.schema.id/field]
   [:lo {:optional true} [:maybe ::checkpoint-bound]]
   [:hi {:optional true} [:maybe ::checkpoint-bound]]
   ;; Count of source rows in (lo, hi] from the same scan that derived the watermark; nil if unavailable.
   [:rows-available {:optional true} [:maybe :int]]])

;;; ------------------------------------------------- Options -------------------------------------------------

(mr/def ::execute-base-options
  "Options map for execute-base! and its implementations."
  [:map {:closed true}
   [:cancelled? {:optional true} ifn?]
   [:run-id {:optional true} [:maybe pos-int?]]
   [:with-stage-timing-fn {:optional true} [:maybe ifn?]]
   [:publish-events? {:optional true} :boolean]
   [:message-log {:optional true} [:maybe ::atom]]
   [:cancel-chan {:optional true} [:maybe ::chan]]
   [:source-range-params {:optional true} [:maybe ::source-range-params]]])

;;; ------------------------------------------------- Result -------------------------------------------------

(mr/def ::execute-base-result
  "Result map returned by execute-base!."
  [:map
   [:status [:enum :succeeded :failed :cancelled :timeout]]
   [:result {:optional true} :any]
   [:error {:optional true} [:maybe (ms/InstanceOfClass Throwable)]]
   [:logs {:optional true} [:maybe :string]]
   [:source-range-params {:optional true} [:maybe ::source-range-params]]])

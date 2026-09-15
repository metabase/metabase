(ns metabase.transforms-base.schema
  "Malli schemas for base transform execution.

   These are the minimal schemas needed for execute-base! and its implementations.
   The full transforms module (metabase.transforms.schema) extends these with
   additional fields like :id (required for scheduled execution)."
  (:require
   [metabase.indexes.schema :as indexes.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms])
  (:import
   (clojure.core.async.impl.channels ManyToManyChannel)
   (clojure.lang Atom)))

;;; ------------------------------------------------- Primitives -------------------------------------------------

(mr/def ::atom
  (ms/InstanceOfClass Atom))

(mr/def ::chan
  (ms/InstanceOfClass ManyToManyChannel))

;;; ------------------------------------------------- Transform -------------------------------------------------

(mr/def ::source-incremental-strategy
  "An incremental strategy on a transform's source, as `get-source-range-params` reads it. The full,
  `:type`-dispatched shape (checkpoint/append/merge variants) is owned by `metabase.transforms.schema`;
  this module only reads the checkpoint fields."
  [:map {:closed true, :probe/id "src/metabase/transforms_base/schema.clj:31"}
   [:type {:optional true} [:or :string :keyword]]
   [:checkpoint-filter-field-id {:optional true} ::lib.schema.id/field]
   [:lookback {:optional true} [:maybe [:map {:closed true, :probe/id "src/metabase/transforms_base/schema.clj:34"}
                                        [:value pos-int?]
                                        [:unit [:or :string :keyword]]]]]])

(mr/def ::transform-target
  "Target specification for a transform. Must include at least :type and :name."
  [:map {:closed true, :probe/id "src/metabase/transforms_base/schema.clj:40"}
   [:type :string]
   [:database {:optional true} :int]
   [:schema {:optional true} [:maybe :string]]
   [:name :string]
   [:indexes {:optional true} [:sequential ::indexes.schema/index-structured]]
   [:target-incremental-strategy {:optional true}
    [:map {:closed false, ::mr/deliberately-open true,
           :description "a target's incremental strategy, owned by metabase.transforms.schema"}]]
   [:index-request-ids {:optional true} [:sequential pos-int?]]])

(mr/def ::transform
  "A transform map as expected by execute-base! implementations. The full transforms module
  (metabase.transforms.schema) hydrates and stores more columns on this same map; they're declared here,
  optional, so that richer value can be threaded through the shared execute-base! machinery unchanged."
  [:map {:closed true, :probe/id "src/metabase/transforms_base/schema.clj:55"}
   [:id {:optional true} pos-int?]
   [:source [:map {:closed true, :probe/id "src/metabase/transforms_base/schema.clj:57"}
             [:type                        [:or :string :keyword]]
             [:query                       {:optional true} [:maybe :metabase.lib-be.schema/maybe-legacy-query]]
             [:body                        {:optional true} :string]
             [:source-tables               {:optional true} [:sequential :metabase.transforms-base.util/source-table-entry]]
             [:source-database             {:optional true} :int]
             [:source-incremental-strategy {:optional true} [:maybe ::source-incremental-strategy]]]]
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
   [:table_dependencies    {:optional true} [:maybe [:sequential [:or
                                                                  [:map {:closed true, :probe/id "src/metabase/transforms_base/schema.clj:81"} [:table ::lib.schema.id/table]]
                                                                  [:map {:closed true, :probe/id "src/metabase/transforms_base/schema.clj:82"} [:transform ::lib.schema.id/transform]]]]]]
   [:tag_ids               {:optional true} [:maybe [:sequential pos-int?]]]])

;;; ----------------------------------------- Source Range Params -----------------------------------------------

(mr/def ::checkpoint-bound
  "A bound (lo or hi) for incremental checkpoint filtering."
  [:map {:closed true, :probe/id "src/metabase/transforms_base/schema.clj:89"}
   [:value [:or number? ms/TemporalInstant]]])

(mr/def ::source-range-params
  "Parameters for incremental range filtering on a source query.
   Returned by get-source-range-params."
  [:map {:closed true, :probe/id "src/metabase/transforms_base/schema.clj:95"}
   [:column ::lib.schema.metadata/column]
   [:checkpoint-filter-field-id ::lib.schema.id/field]
   [:lo {:optional true} [:maybe ::checkpoint-bound]]
   [:hi {:optional true} [:maybe ::checkpoint-bound]]
   ;; Count of source rows in (lo, hi] from the same scan that derived the watermark; nil if unavailable.
   [:rows-available {:optional true} [:maybe :int]]])

;;; ------------------------------------------------- Options -------------------------------------------------

(mr/def ::execute-base-options
  "Options map for execute-base! and its implementations."
  [:map {:closed true, :probe/id "src/metabase/transforms_base/schema.clj:107"}
   [:cancelled? {:optional true} ifn?]
   [:run-id {:optional true} [:maybe pos-int?]]
   [:with-stage-timing-fn {:optional true} ifn?]
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

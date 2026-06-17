(ns metabase.indexes.models.table-index
  "The `metabase_table_indexes` model: index/clustering hints for a table.

  Every row binds to a transform (`:transform_id`) whose target it indexes, carries a structured index definition
  (see [[metabase.indexes.schema]]), and tracks a lifecycle `:status` (defaulting to `:pending`). The target table is
  read off the transform's `:target_table_id`, not mirrored here. The table is named generically so it can hold
  indexes for non-transform tables later too.

  `:structured` and `:status` are validated at the transform layer (on read and write), so every writer is covered.
  Callers use toucan2 directly; there are no wrapper functions."
  (:require
   [metabase.indexes.schema :as schema]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/TableIndex [_model] :metabase_table_indexes)

(doto :model/TableIndex
  (derive :metabase/model)
  (derive :hook/timestamped?))

(def ^:private transform-structured
  "JSON in/out for `:structured`, re-keywordizing enum-valued fields (the `fixes`) and validating against the schema
  on both read and write."
  (mi/transform-validator-with-fixes
   {:in mi/json-in, :out mi/json-out-with-keywordization}
   #(mu/validate-throw ::schema/index-structured %)
   schema/keywordize-structured))

(t2/deftransforms :model/TableIndex
  {:structured transform-structured
   :status     (mi/transform-validator mi/transform-keyword (partial mi/assert-enum schema/statuses))})

(def ^:private defaults
  {:status :pending})

(t2/define-before-insert :model/TableIndex
  [req]
  (merge defaults req))

;; Inlined into the owning transform's serialization (see the Transform make-spec's `:indexes`). Only the index
;; definition travels; lifecycle is local, so an imported index starts fresh as `:pending`. `:structured` holds
;; physical column names (no portable refs), so it copies verbatim. `:created_by` is skipped: a nested child's own
;; FKs aren't declared in the transform's `dependencies`, so the user may not resolve on import.
(defmethod serdes/make-spec "TableIndex"
  [_model-name _opts]
  {:copy      [:index_name :structured]
   :skip      [:status :error_message :last_executed_at :created_by]
   :transform {:transform_id (serdes/parent-ref)
               :created_at   (serdes/date)}})

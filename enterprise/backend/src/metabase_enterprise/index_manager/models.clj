(ns metabase-enterprise.index-manager.models
  "The `metabase_index_request` model: index/clustering hints declared on a transform target table.

  Each request binds to a transform (`:transform_id`), carries a structured index definition (see
  [[metabase-enterprise.index-manager.schema]]), and tracks a lifecycle `:status` (defaulting to `:pending`).
  `:table_id` is backfilled once the target table first syncs.

  `:structured` and `:status` are validated at the transform layer (on read and write), so every writer is covered.
  Callers use toucan2 directly; there are no wrapper functions."
  (:require
   [metabase-enterprise.index-manager.schema :as schema]
   [metabase.models.interface :as mi]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/IndexRequest [_model] :metabase_index_request)

(doto :model/IndexRequest
  (derive :metabase/model)
  (derive :hook/timestamped?))

(def ^:private transform-structured
  "JSON in/out for `:structured`, re-keywordizing enum-valued fields (the `fixes`) and validating against the schema
  on both read and write."
  (mi/transform-validator-with-fixes
   {:in mi/json-in, :out mi/json-out-with-keywordization}
   #(mu/validate-throw ::schema/index-structured %)
   schema/keywordize-structured))

(t2/deftransforms :model/IndexRequest
  {:structured transform-structured
   :status     (mi/transform-validator mi/transform-keyword (partial mi/assert-enum schema/statuses))})

(def ^:private defaults
  {:status :pending})

(t2/define-before-insert :model/IndexRequest
  [req]
  (merge defaults req))

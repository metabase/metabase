(ns metabase.usage-metadata.models.source-dimension-profile-daily
  "Daily rollup of dimension-profile observations (`:single-value`, `:all-null`,
  `:low-cardinality`) for fields that showed up as direct table dimensions in
  the day's activity. Each observation is read from the field's existing
  `Field.fingerprint` (populated by the sync fingerprinter); `source_basis` is
  `:fingerprint`."
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/SourceDimensionProfileDaily [_model] :source_dimension_profile_daily)

(defmethod app-db-copy/spec :model/SourceDimensionProfileDaily [_model]
  {:skip? true})

(t2/deftransforms :model/SourceDimensionProfileDaily
  {:source_type      mi/transform-keyword
   :source_basis     mi/transform-keyword
   :observation_type mi/transform-keyword})

(derive :model/SourceDimensionProfileDaily :metabase/model)

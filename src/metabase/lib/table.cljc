(ns metabase.lib.table
  (:require
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.util :as lib.util]
   [metabase.util.humanization :as u.humanization]))

(defmethod lib.metadata.calculation/display-name-method :metadata/table
  [_query _stage-number table-metadata]
  (or (:display_name table-metadata)
      (some->> (:name table-metadata)
               (u.humanization/name->human-readable-name :simple))))

(defmethod lib.metadata.calculation/describe-top-level-key :source-table
  [query stage-number _k]
  (let [stage (lib.util/query-stage query stage-number)]
    (when-let [source-table-id (:source-table stage)]
      (when-let [table-metadata (lib.metadata/table query source-table-id)]
        (lib.metadata.calculation/display-name query stage-number table-metadata)))))

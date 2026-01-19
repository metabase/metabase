(ns metabase.lib.table
  (:require
   [metabase.lib.field.util :as lib.field.util]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.unique-name-generator :as lib.util.unique-name-generator]
   [metabase.util.humanization :as u.humanization]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]))

(defmethod lib.metadata.calculation/display-name-method :metadata/table
  [_query _stage-number table-metadata _style]
  (or (:display-name table-metadata)
      (some->> (:name table-metadata)
               (u.humanization/name->human-readable-name :simple))))

(defmethod lib.metadata.calculation/metadata-method :metadata/table
  [_query _stage-number table-metadata]
  table-metadata)

(defmethod lib.metadata.calculation/describe-top-level-key-method :source-table
  [query stage-number _k]
  (let [{:keys [source-table]} (lib.util/query-stage query stage-number)]
    (when source-table
      (assert (integer? source-table)
              (i18n/tru "Unexpected source table ID {0}" (pr-str source-table)))
      (or (when-let [table-metadata (lib.metadata/table query source-table)]
            (lib.metadata.calculation/display-name query stage-number table-metadata :long))
          (i18n/tru "Table {0}" (pr-str source-table))))))

(mu/defmethod lib.metadata.calculation/returned-columns-method :metadata/table :- ::lib.metadata.calculation/returned-columns
  [query _stage-number table-metadata {:keys [include-sensitive-fields?]}]
  (into []
        (comp (map #(assoc % :lib/source :source/table-defaults))
              ;; don't truncate column names, if the database says they're ok we should assume they are and we need to
              ;; refer back to them using their original names anyway. Note that returned columns for a table ARE NOT
              ;; equal to returned columns for a stage with this source table and nothing else... those SHOULD get
              ;; truncated desired aliases when they stage returned columns are calculated.
              (lib.field.util/add-source-and-desired-aliases-xform query (lib.util.unique-name-generator/non-truncating-unique-name-generator)))
        (lib.metadata/active-fields query (:id table-metadata) {:include-sensitive? include-sensitive-fields?})))

(ns metabase.lib.table
  (:require
   [metabase.lib.field.util :as lib.field.util]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.util :as lib.util]
   [metabase.util :as u]
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

(def ^:private ^{:arglists '([rf])} remove-hidden-default-fields-xform
  "Remove Fields that shouldn't be visible from the default Fields for a source Table.
  See [[metabase.query-processor.middleware.add-implicit-clauses/table->sorted-fields*]]."
  (remove (fn [{:keys [visibility-type], active? :active, :as _col}]
            (or (false? active?)
                (#{:sensitive :retired} (some-> visibility-type keyword))))))

(defn- sort-default-fields
  "Sort default Fields for a source Table. See [[metabase.warehouse-schema.models.table/field-order-rule]]."
  [field-metadatas]
  (sort-by (fn [{field-name :name, :keys [position], :as _field-metadata}]
             [(or position 0) (u/lower-case-en (or field-name ""))])
           field-metadatas))

(mu/defmethod lib.metadata.calculation/returned-columns-method :metadata/table :- ::lib.metadata.calculation/returned-columns
  [query _stage-number table-metadata _options]
  (when-let [field-metadatas (lib.metadata/fields query (:id table-metadata))]
    (into []
          (comp remove-hidden-default-fields-xform
                (map #(assoc % :lib/source :source/table-defaults))
                (lib.field.util/add-source-and-desired-aliases-xform query))
          (sort-default-fields field-metadatas))))

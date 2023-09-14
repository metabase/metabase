(ns metabase.lib.test-util.metadata-providers.remap
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.test-util.metadata-providers.mock
    :as lib.tu.metadata-providers.mock]
   [metabase.lib.util :as lib.util]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(mu/defn ^:private external-remapped-column :- lib.metadata/ColumnMetadata
  "Add an 'external' 'Human Readable Values' remap from values of `original` Field to values of `remapped` Field."
  [metadata-provider :- lib.metadata/MetadataProvider
   original          :- lib.metadata/ColumnMetadata
   remapped          :- [:or lib.metadata/ColumnMetadata ::lib.schema.id/field]]
  (let [remapped   (if (integer? remapped)
                     (lib.metadata/field metadata-provider remapped)
                     remapped)
        remap-info {:lib/type :metadata.column.remapping/external
                    :id       (* (u/the-id original) 10) ; we just need an ID that will be unique for each Field.
                    :name     (lib.util/format "%s [external remap]" (:display-name original))
                    :field-id (u/the-id remapped)}]
    (assoc original :lib/external-remap remap-info)))

(mu/defn ^:private internal-remapped-column :- lib.metadata/ColumnMetadata
  "Add an 'internal' 'FieldValues' remap from values of `original` Field to hardcoded `remap` values."
  [original :- lib.metadata/ColumnMetadata
   remap    :- [:or
                [:sequential :any]
                :map]]
  (let [original-values (if (sequential? remap)
                          (range 1 (inc (count remap)))
                          (keys remap))
        remapped-values (if (sequential? remap)
                          remap
                          (vals remap))
        remap-info      {:lib/type              :metadata.column.remapping/internal
                         :id                    (* (u/the-id original) 100) ; we just need an ID that will be unique for each Field.
                         :name                  (lib.util/format "%s [internal remap]" (:display-name original))
                         :values                original-values
                         :human-readable-values remapped-values}]
    (assoc original :lib/internal-remap remap-info)))

(mu/defn ^:private remapped-column :- lib.metadata/ColumnMetadata
  "Add a remap to an `original` column metadata. Type of remap added depends of value of `remap`:

    * Field ID: external remap with values of original replaced by values of remapped Field with ID
    * Field metadata: external remap with values of original replaced by values of remapped Field
    * Sequence of values: internal remap with integer values of original replaced by value at the corresponding index
    * Map of original value => remapped value: internal remap with values replaced with corresponding value in map"
  [metadata-provider :- lib.metadata/MetadataProvider
   original          :- [:or lib.metadata/ColumnMetadata ::lib.schema.id/field]
   remap             :- [:or
                         lib.metadata/ColumnMetadata
                         ::lib.schema.id/field
                         [:sequential :any]
                         :map]]
  (let [original (if (integer? original)
                   (lib.metadata/field metadata-provider original)
                   original)]
    (if (or (integer? remap)
            (= (lib.dispatch/dispatch-value remap) :metadata/column))
      (external-remapped-column metadata-provider original remap)
      (internal-remapped-column original remap))))

(mu/defn remap-metadata-provider  :- lib.metadata/MetadataProvider
  "Composed metadata provider that adds an internal or external remap for `original` Field with [[remapped-column]].
  For QP tests, you may want to use [[metabase.query-processor.test-util/field-values-from-def]] to get values to
  create an internal remap."
  ([metadata-provider :- lib.metadata/MetadataProvider
    original          :- [:or lib.metadata/ColumnMetadata ::lib.schema.id/field]
    remap             :- [:or
                          lib.metadata/ColumnMetadata
                          ::lib.schema.id/field
                          [:sequential :any]
                          :map]]
   (let [original' (remapped-column metadata-provider original remap)]
     (lib.tu.metadata-providers.mock/mock-metadata-provider
      metadata-provider
      {:fields [original']})))

  ([metadata-provider original remap & more]
   (apply remap-metadata-provider (remap-metadata-provider metadata-provider original remap) more)))

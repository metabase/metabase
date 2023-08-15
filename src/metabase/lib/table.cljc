(ns metabase.lib.table
  (:require
   [metabase.lib.join :as lib.join]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.field :as lib.field]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util :as u]
   [metabase.util.humanization :as u.humanization]
   [metabase.util.malli :as mu]
   [metabase.lib.schema :as lib.schema]))

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

(defn- remove-hidden-default-fields
  "Remove Fields that shouldn't be visible from the default Fields for a source Table.
  See [[metabase.query-processor.middleware.add-implicit-clauses/table->sorted-fields*]]."
  [field-metadatas]
  (remove (fn [{:keys [visibility-type], active? :active, :as _field-metadata}]
            (or (false? active?)
                (#{:sensitive :retired} (some-> visibility-type keyword))))
          field-metadatas))

(defn- sort-default-fields
  "Sort default Fields for a source Table. See [[metabase.models.table/field-order-rule]]."
  [field-metadatas]
  (sort-by (fn [{field-name :name, :keys [position], :as _field-metadata}]
             [(or position 0) (u/lower-case-en (or field-name ""))])
           field-metadatas))

(mu/defn ^:private remap-fields :- [:sequential ::lib.schema.metadata/column]
  [query           :- ::lib.schema/query
   stage-number    :- :int
   unique-name-fn  :- fn?
   original-fields :- [:sequential ::lib.schema.metadata/column]]
  (into []
        (comp (filter :lib/external-remap)
              (map (fn [{{external-remap-field-id :field-id} :lib/external-remap, :as field}]
                     (when-let [remap-field (lib.metadata/field query external-remap-field-id)]
                       (let [remap-field   (assoc remap-field
                                                :lib/source               :source/external-remaps
                                                :lib/source-column-alias  (:name remap-field)
                                                :fk-field-id              (:id field)
                                                :remapped-from            (:lib/desired-column-alias field))
                             desired-alias (unique-name-fn (lib.field/desired-alias query stage-number remap-field))]
                         (assoc remap-field :lib/desired-column-alias desired-alias)))))
              (filter some?))
        original-fields))

(mu/defn ^:private add-remapping-info :- [:sequential ::lib.schema.metadata/column]
  [original-fields :- [:sequential ::lib.schema.metadata/column]
   remapped-fields :- [:sequential ::lib.schema.metadata/column]]
  (mapv (fn [{{external-remap-field-id :field-id} :lib/external-remap, :as field}]
          (let [remapped-name (when external-remap-field-id
                                (some (fn [remap-field]
                                        (when (= (:id remap-field) external-remap-field-id)
                                          (:lib/desired-column-alias remap-field)))
                                      remapped-fields))]
            (cond-> field
              remapped-name (assoc :remapped-to remapped-name))))
        original-fields))

(mu/defn ^:private add-external-remaps :- [:sequential ::lib.schema.metadata/column]
  [query           :- ::lib.schema/query
   stage-number    :- :int
   unique-name-fn  :- fn?
   field-metadatas :- [:sequential ::lib.schema.metadata/column]]
  (if-let [remaps (not-empty (remap-fields query stage-number unique-name-fn field-metadatas))]
    (into [] cat [(add-remapping-info field-metadatas remaps) remaps])
    field-metadatas))

(defmethod lib.metadata.calculation/returned-columns-method :metadata/table
  [query stage-number table-metadata {:keys [unique-name-fn], :as _options}]
  (when-let [field-metadatas (lib.metadata/fields query (:id table-metadata))]
    (->> field-metadatas
         remove-hidden-default-fields
         sort-default-fields
         (mapv (fn [col]
                 (assoc col
                        :lib/source               :source/table-defaults
                        :lib/source-column-alias  (:name col)
                        :lib/desired-column-alias (unique-name-fn (lib.field/desired-alias query stage-number col)))))
         (add-external-remaps query stage-number unique-name-fn))))

(defmethod lib.join/join-clause-method :metadata/table
  [{::keys [join-alias join-fields], :as table-metadata}]
  (cond-> (lib.join/join-clause {:lib/type     :mbql.stage/mbql
                                 :lib/options  {:lib/uuid (str (random-uuid))}
                                 :source-table (:id table-metadata)})
    join-alias  (lib.join/with-join-alias join-alias)
    join-fields (lib.join/with-join-fields join-fields)))

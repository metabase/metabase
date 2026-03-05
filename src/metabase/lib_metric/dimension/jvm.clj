(ns metabase.lib-metric.dimension.jvm
  "JVM-only dimension computation. Moved from `dimension.cljc` so that
   `compute-dimension-pairs` can enrich columns with `:has-field-values`
   via a direct database lookup, which is only available on the JVM."
  (:require
   [metabase.lib-be.core :as lib-be]
   [metabase.lib-metric.metadata.provider :as lib-metric.provider]
   [metabase.lib.core :as lib]
   [metabase.lib.util :as lib.util]
   [metabase.util.performance :as perf]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn enrich-columns-with-has-field-values
  "Batch-fetch `has_field_values` from Field and assoc `:has-field-values` onto each column."
  [cols]
  (if (perf/empty? cols)
    cols
    (let [col-ids           (into #{} (keep :id) cols)
          field-values-map  (when (seq col-ids)
                              (into {}
                                    (map (fn [field]
                                           [(:id field)
                                            (lib/infer-has-field-values
                                             (lib-be/instance->metadata field :metadata/column))]))
                                    (t2/select :model/Field :id [:in col-ids])))]
      (perf/mapv (fn [col]
                   (if-let [hfv (get field-values-map (:id col))]
                     (assoc col :has-field-values hfv)
                     col))
                 cols))))

(defn- column->computed-pair
  "Convert a column to a dimension/mapping pair. IDs are nil until reconciliation.
   The table-id is extracted from the column's metadata.
   When `group` is provided, it is attached to the dimension."
  ([column]
   (column->computed-pair column nil))
  ([column group]
   (let [target (lib/ref column)
         has-field-values (lib/infer-has-field-values column)]
     {:dimension (cond-> {:id             nil
                          :name           (:name column)
                          :effective-type (or (:effective-type column)
                                              (:base-type column))}
                   (:display-name column)    (assoc :display-name (:display-name column))
                   (:semantic-type column)   (assoc :semantic-type (:semantic-type column))
                   (:lib/source column)      (assoc :lib/source (:lib/source column))
                   (pos-int? (:id column))   (assoc :sources [(cond-> {:type :field, :field-id (:id column)}
                                                                (let [fp (:fingerprint column)]
                                                                  (and (perf/get-in fp [:type :type/Number :min])
                                                                       (perf/get-in fp [:type :type/Number :max])))
                                                                (assoc :binning true))])
                   has-field-values          (assoc :has-field-values has-field-values)
                   group                     (assoc :group group))
      :mapping   (cond-> {:type   :table
                          :target target}
                   (:table-id column) (assoc :table-id (:table-id column)))})))

(defn- db-provider-for-query
  "When the metadata provider is a MetricContextMetadataProvider, return the
   database-specific provider for the query's source table. The DB provider can
   resolve column-by-ID lookups that the metric context provider cannot, which
   is required for FK / implicitly-joinable column resolution."
  [mp query-with-mp]
  (when (satisfies? lib-metric.provider/MetricMetadataProvider mp)
    (when-let [table-id (lib.util/source-table-id query-with-mp)]
      (lib-metric.provider/database-provider-for-table mp table-id))))

(defn- group-type->type
  "Convert a column group's group-type to a dimension group type string."
  [group-type]
  (case group-type
    :group-type/main "main"
    (:group-type/join.explicit :group-type/join.implicit) "connection"))

(defn compute-dimension-pairs
  "Compute dimension/mapping pairs from visible columns. IDs not yet assigned.
   Only includes actual database fields, not expressions.
   Dimensions are annotated with their source group (main table vs connected tables).
   Columns are enriched with `:has-field-values` from the database."
  [metadata-providerable query]
  (let [mp            (lib/->metadata-provider metadata-providerable)
        query-with-mp (lib/query mp query)
        db-mp         (db-provider-for-query mp query-with-mp)
        vc-query      (if db-mp (lib/query db-mp query) query-with-mp)
        columns       (cond-> (lib/visible-columns
                               vc-query
                               -1
                               {:include-implicitly-joinable?                 (boolean db-mp)
                                :include-implicitly-joinable-for-source-card? false})
                        true enrich-columns-with-has-field-values)
        col-groups    (lib/group-columns columns)]
    (into []
          (mapcat
           (fn [col-group]
             (let [group-info  (lib/display-info vc-query -1 col-group)
                   group-type  (cond
                                 (:is-main-group group-info)          :group-type/main
                                 (:is-from-join group-info)           :group-type/join.explicit
                                 (:is-implicitly-joinable group-info) :group-type/join.implicit
                                 :else                                :group-type/main)
                   group-desc  {:id           (str (random-uuid))
                                :type         (group-type->type group-type)
                                :display-name (or (:display-name group-info) "Unknown")}
                   group-cols  (lib/columns-group-columns col-group)]
               (->> group-cols
                    (remove #(= :source/expressions (:lib/source %)))
                    (perf/mapv #(column->computed-pair % group-desc))))))
          col-groups)))

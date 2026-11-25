(ns metabase.lib-metric.dimension.jvm
  "JVM-only dimension computation. Moved from `dimension.cljc` so that
   `compute-dimension-pairs` can enrich columns with `:has-field-values`
   via a direct database lookup, which is only available on the JVM."
  (:require
   [metabase.lib-be.core :as lib-be]
   [metabase.lib-metric.db :as lib-metric.db]
   [metabase.lib-metric.dimension :as lib-metric.dimension]
   [metabase.lib-metric.metadata.provider :as lib-metric.provider]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.util.performance :as perf])
  (:import (java.util UUID)))

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
                                    (lib-metric.db/fields col-ids)))]
      (perf/mapv (fn [col]
                   (if-let [hfv (get field-values-map (:id col))]
                     (assoc col :has-field-values hfv)
                     col))
                 cols))))

(defn- field-id-ref
  "Build a field ref using the column's integer ID rather than its name.
   Source-card columns have integer :id but `lib/ref` produces name-based refs;
   dimension mappings need integer field IDs for the AST.

   For source-card columns that are FK-remapped (e.g. PRODUCTS.TITLE appearing as
   display value for ORDERS.PRODUCT_ID), `:lib/original-fk-field-id` captures the FK
   column. We include it as `:source-field` so the compiled query gets the implicit join."
  [column]
  (let [ref (lib/ref column)]
    (if (and (pos-int? (:id column))
             (not (pos-int? (nth ref 2 nil))))
      (cond-> (assoc ref 2 (:id column))
        (:lib/original-fk-field-id column)
        (assoc-in [1 :source-field] (:lib/original-fk-field-id column)))
      ref)))

(defn- field-natural-key
  "A fn of a Field id giving the Field's `[db-name schema table-name & field-names]`, its name on every instance with
  its Database, from `mp`, the provider of the query's Database, or the id itself when `mp` cannot give it."
  [mp]
  (memoize
   (fn [field-id]
     (or (try
           (when-let [field (lib.metadata/field mp field-id)]
             (let [table       (lib.metadata/table mp (:table-id field))
                   field-names (loop [field field, names ()]
                                 (let [names (conj names (:name field))]
                                   (if-let [parent (some->> (:parent-id field) (lib.metadata/field mp))]
                                     (recur parent names)
                                     names)))]
               (into [(:name (lib.metadata/database mp)) (:schema table) (:name table)] field-names)))
           (catch Exception _ nil))
         field-id))))

(defn- portable-target-key
  "The [[lib-metric.dimension/field-ref->key]] of `target` with each Field id in it, its own and its `:source-field`,
  replaced by what `natural-key` gives for it."
  [natural-key target]
  (let [[clause-type opts id-or-name] (lib-metric.dimension/field-ref->key target)
        natural                       #(cond-> % (pos-int? %) natural-key)]
    [clause-type
     (cond-> opts (contains? opts :source-field) (update :source-field natural))
     (natural id-or-name)]))

(defn- dimension-id
  "Id for a computed dimension, derived from the entity it belongs to and the column it maps to rather than
   generated.

   Un-curated metrics recompute their whole dimension set on every read (the `card_schema` 23->24 backfill) and
   persist nothing, so a generated id would hand the same metric a different dimension set — and therefore a
   different serialization — on every SELECT. Its remote-sync content hash would never settle, and anything that
   stored one of those ids would be pointing at nothing by the next read.

   `owner-key` scopes the id to its entity, so two metrics over the same column do not collide. That matters
   because ids are resolved entity-wide (`dimensions-for-table`) and instance-wide
   ([[metabase.lib-metric.dimension/dimension]]), not only against their own entity's `dimension_mappings`, and
   because the measure sync path persists these ids the first time it sees a column.

   Contrast [[group-id]], which is deliberately NOT scoped: a column group is the same group wherever it appears,
   and its id is already persisted unscoped on curated entities.

   `column-name` is in the seed because the target alone does not identify a column. [[field-id-ref]] rewrites a
   source-card column's ref to use the column's integer *field* id, and a model that joins one table twice — a
   self-join, or two joins to the same table — surfaces each of that table's fields twice with the same field id.
   The join alias that tells the two copies apart lives inside the *model's* query, not in the outer query's refs,
   so both targets reduce to the same [[metabase.lib-metric.dimension/field-ref->key]]. Without the name they
   would share an id, and since dimensions resolve by id, editing one would rewrite its twin. The deduplicated
   column name (`PRICE` vs `PRICE_2`) is what survives to tell them apart.

   The seed is portable: `owner-key` is the entity's entity id, and `target-key` names its Fields by natural keys
   (see [[portable-target-key]]), so an instance and its git-sync restore, whose rows have other numeric ids, derive
   the same id for the same dimension."
  ^String [owner-key column-name target-key]
  (-> [owner-key column-name target-key]
      pr-str
      (.getBytes "UTF-8")
      UUID/nameUUIDFromBytes
      str))

(defn- column->computed-pair
  "Convert a column to a dimension/mapping pair. The dimension id is derived from `owner-key` and the mapping
   target, its Fields named by `natural-key`; reconciliation replaces it with the persisted id when the column is
   already curated. The table-id is extracted from the column's metadata.
   When `group` is provided, it is attached to the dimension."
  ([owner-key natural-key column]
   (column->computed-pair owner-key natural-key column nil))
  ([owner-key natural-key column group]
   (let [target (field-id-ref column)
         has-field-values (lib/infer-has-field-values column)]
     {:dimension (cond-> {:id             (dimension-id owner-key (:name column) (portable-target-key natural-key target))
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
   is required for FK / implicitly-joinable column resolution.

   For source-card queries (metrics based on models or saved questions), resolves
   the card's table_id and uses that to find the database provider. Native-SQL
   models have no underlying table (`:table_id` is nil), so in that case we fall
   back to the card's `:database_id` and look up the database provider directly."
  [mp query-with-mp]
  (when (satisfies? lib-metric.provider/MetricMetadataProvider mp)
    (or (when-let [table-id (lib.util/source-table-id query-with-mp)]
          (lib-metric.provider/database-provider-for-table mp table-id))
        (when-let [card-id (lib.util/source-card-id query-with-mp)]
          (when-let [{:keys [table_id database_id]}
                     (lib-metric.db/card-table-and-database-id card-id)]
            (or (when table_id
                  (lib-metric.provider/database-provider-for-table mp table_id))
                (when database_id
                  (lib-metric.provider/database-provider-for-database mp database_id))))))))

(defn- group-type->type
  "Convert a column group's group-type to a dimension group type string."
  [group-type]
  (case group-type
    :group-type/main "main"
    (:group-type/join.explicit :group-type/join.implicit) "connection"))

(defn- group-id
  "Id for a column group, derived from the group's identity rather than generated.

   The id is persisted on every dimension that belongs to the group and is one of the keys
   `metabase.lib-metric.dimension/dimensions-changed?` compares, so a freshly generated id would
   make every sync look like a change and rewrite the row — including on the read paths that sync
   first."
  ^String [type-str display-name]
  (str (UUID/nameUUIDFromBytes (.getBytes (str type-str "/" display-name) "UTF-8"))))

(defn compute-dimension-pairs
  "Compute dimension/mapping pairs from visible columns.
   Only includes actual database fields, not expressions.
   Dimensions are annotated with their source group (main table vs connected tables).
   Columns are enriched with `:has-field-values` from the database.

   `owner-key` is a salt identifying the entity these dimensions belong to; see [[dimension-id]], which derives each
   dimension's id from it. For the ids to be the same on an instance and its restore it must be too, such as an
   entity id; callers that discard the ids (comparing targets only) may pass anything."
  [metadata-providerable owner-key query]
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
        col-groups    (lib/group-columns columns)
        natural-key   (field-natural-key (or db-mp mp))]
    (into []
          (mapcat
           (fn [col-group]
             (let [group-info  (lib/display-info vc-query -1 col-group)
                   group-type  (cond
                                 (:is-main-group group-info)          :group-type/main
                                 (:is-from-join group-info)           :group-type/join.explicit
                                 (:is-implicitly-joinable group-info) :group-type/join.implicit
                                 :else                                :group-type/main)
                   group-kind  (group-type->type group-type)
                   group-name  (or (:display-name group-info) "Unknown")
                   group-desc  {:id           (group-id group-kind group-name)
                                :type         group-kind
                                :display-name group-name}
                   group-cols  (lib/columns-group-columns col-group)]
               (->> group-cols
                    (remove #(= :source/expressions (:lib/source %)))
                    (perf/mapv #(column->computed-pair owner-key natural-key % group-desc))))))
          col-groups)))

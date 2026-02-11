(ns metabase.lib-metric.dimension
  "Core logic for computing and reconciling dimensions from dimensionable entities
   (Measures, Metrics v2, future v3). Dimensions are computed from visible columns
   and reconciled with persisted dimensions on each read."
  (:require
   [medley.core :as m]
   [metabase.lib-metric.metadata.provider :as lib-metric.provider]
   [metabase.lib-metric.schema :as lib-metric.schema]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util :as lib.util]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]
   [metabase.util.performance :as perf]))

;;; ------------------------------------------------- Target Comparison -------------------------------------------------

(defn- normalize-target
  "Normalize a target ref for comparison by removing transient options."
  [[clause-type opts id-or-name]]
  [clause-type
   (dissoc opts :lib/uuid :effective-type :base-type)
   id-or-name])

(defn targets-equal?
  "Compare two target refs for equality, ignoring transient options like :lib/uuid."
  [target-a target-b]
  (= (normalize-target target-a) (normalize-target target-b)))

(defn- random-uuid-str []
  (str (random-uuid)))

;;; ------------------------------------------------- Dimension Computation -------------------------------------------------

(defn- column->computed-pair
  "Convert a column to a dimension/mapping pair. IDs are nil until reconciliation.
   The table-id is extracted from the column's metadata.
   When `group` is provided, it is attached to the dimension."
  ([column]
   (column->computed-pair column nil))
  ([column group]
   (let [target (lib/ref column)]
     {:dimension (cond-> {:id   nil
                          :name (:name column)}
                   (:display-name column)    (assoc :display-name (:display-name column))
                   (:effective-type column)  (assoc :effective-type (:effective-type column))
                   (:semantic-type column)   (assoc :semantic-type (:semantic-type column))
                   (:lib/source column)      (assoc :lib/source (:lib/source column))
                   (pos-int? (:id column))   (assoc :sources [(cond-> {:type :field, :field-id (:id column)}
                                                                (let [fp (:fingerprint column)]
                                                                  (and (get-in fp [:type :type/Number :min])
                                                                       (get-in fp [:type :type/Number :max])))
                                                                (assoc :binning true))])
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
    (:group-type/join.explicit :group-type/join.implicit) "connection"
    "connection"))

(defn compute-dimension-pairs
  "Compute dimension/mapping pairs from visible columns. IDs not yet assigned.
   Only includes actual database fields, not expressions.
   Dimensions are annotated with their source group (main table vs connected tables)."
  [metadata-providerable query]
  (let [mp            (lib/->metadata-provider metadata-providerable)
        query-with-mp (lib/query mp query)
        db-mp         (db-provider-for-query mp query-with-mp)
        vc-query      (if db-mp (lib/query db-mp query) query-with-mp)
        columns       (lib/visible-columns
                       vc-query
                       -1
                       {:include-implicitly-joinable?                 (boolean db-mp)
                        :include-implicitly-joinable-for-source-card? false})
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
                    (mapv #(column->computed-pair % group-desc))))))
          col-groups)))

;;; ------------------------------------------------- Dimension Normalization -------------------------------------------------

(defn- normalize-dimension-source
  "Normalize a dimension source entry after JSON round-trip.
   JSON serialization converts keyword values to strings (e.g. :field → \"field\")."
  [source]
  (cond-> source
    (string? (:type source)) (update :type keyword)))

(defn normalize-persisted-dimension
  "Normalize a persisted dimension after database read.
   Handles JSON round-trip artifacts like string enum values in :sources and :status."
  [dim]
  (cond-> dim
    (seq (:sources dim)) (update :sources #(mapv normalize-dimension-source %))
    (string? (:status dim)) (update :status keyword)))

;;; ------------------------------------------------- Dimension Reconciliation -------------------------------------------------

(defn- orphaned-status-message
  "Generate a human-readable status message for an orphaned dimension."
  [dimension]
  (i18n/tru "Column ''{0}'' no longer exists in the data source" (:name dimension)))

(defn- find-persisted-by-target
  "Find a persisted dimension by matching its mapping's target to the given target."
  [target persisted-mappings persisted-dims-by-id]
  (when-let [mapping (m/find-first #(targets-equal? target (:target %)) persisted-mappings)]
    (get persisted-dims-by-id (:dimension-id mapping))))

(defn- merge-persisted-modifications
  "Merge user modifications from a persisted dimension into a computed dimension.
   Status is already assigned by assign-ids-and-reconcile, so we only merge
   user customizations and clear any stale status-message."
  [computed-dim persisted-dim]
  (if persisted-dim
    (-> computed-dim
        (merge (perf/select-keys persisted-dim [:display-name :semantic-type :effective-type]))
        (dissoc :status-message))
    computed-dim))

(defn- assign-ids-and-reconcile
  "Assign IDs to computed dimensions by matching targets to persisted mappings.
   Returns vector of {:dimension ... :mapping ...} with IDs assigned.
   All active dimensions are assigned :status/active so they will be persisted."
  [computed-pairs persisted-dims persisted-mappings]
  (let [persisted-dims-by-id (m/index-by :id persisted-dims)]
    (perf/mapv (fn [{:keys [dimension mapping]}]
                 (let [persisted-dim (find-persisted-by-target (:target mapping)
                                                               persisted-mappings
                                                               persisted-dims-by-id)
                       dim-id        (or (:id persisted-dim) (random-uuid-str))
                       merged-dim    (-> dimension
                                         (assoc :id dim-id)
                                         (assoc :status :status/active)
                                         (merge-persisted-modifications persisted-dim))]
                   {:dimension merged-dim
                    :mapping   (assoc mapping :dimension-id dim-id)}))
               computed-pairs)))

(defn- find-orphaned-dimensions
  "Find persisted dimensions whose targets no longer exist in computed pairs."
  [computed-pairs persisted-dims persisted-mappings]
  (let [computed-targets    (set (map (comp normalize-target :target :mapping) computed-pairs))
        persisted-dims-by-id (m/index-by :id persisted-dims)]
    (->> persisted-mappings
         (remove #(contains? computed-targets (normalize-target (:target %))))
         (keep (fn [orphan-mapping]
                 (when-let [dim (get persisted-dims-by-id (:dimension-id orphan-mapping))]
                   (when (:status dim)
                     (-> dim
                         (assoc :status :status/orphaned)
                         (assoc :status-message (orphaned-status-message dim))))))))))

(mu/defn reconcile-dimensions-and-mappings :- [:map
                                               [:dimensions [:sequential ::lib-metric.schema/persisted-dimension]]
                                               [:dimension-mappings [:sequential ::lib-metric.schema/dimension-mapping]]]
  "Reconcile computed dimension pairs with persisted data by matching on target.
   Returns {:dimensions [...] :dimension-mappings [...]}."
  [computed-pairs    :- [:sequential ::lib-metric.schema/computed-pair]
   persisted-dims    :- [:maybe [:sequential ::lib-metric.schema/persisted-dimension]]
   persisted-mappings :- [:maybe [:sequential ::lib-metric.schema/dimension-mapping]]]
  (let [reconciled-pairs (assign-ids-and-reconcile computed-pairs
                                                   (or persisted-dims [])
                                                   (or persisted-mappings []))
        active-dims      (perf/mapv :dimension reconciled-pairs)
        active-mappings  (perf/mapv :mapping reconciled-pairs)
        orphaned-dims    (find-orphaned-dimensions computed-pairs
                                                   (or persisted-dims [])
                                                   (or persisted-mappings []))]
    {:dimensions         (into active-dims orphaned-dims)
     :dimension-mappings active-mappings}))

(mu/defn extract-persisted-dimensions :- [:sequential ::lib-metric.schema/persisted-dimension]
  "Extract dimensions that should be persisted to the database.
   A dimension should be persisted if it has a status (either active or orphaned)."
  [dimensions :- [:sequential ::lib-metric.schema/persisted-dimension]]
  (filterv :status dimensions))

(mu/defn dimensions-changed? :- :boolean
  "Check if the persisted dimensions have changed between old and new sets."
  [old-persisted :- [:maybe [:sequential ::lib-metric.schema/persisted-dimension]]
   new-persisted :- [:sequential ::lib-metric.schema/persisted-dimension]]
  (let [persist-keys [:id :name :display-name :semantic-type :effective-type :status :status-message :sources :group]
        normalize    (fn [dims] (set (map #(perf/select-keys % persist-keys) dims)))]
    (not= (normalize old-persisted) (normalize new-persisted))))

(mu/defn mappings-changed? :- :boolean
  "Check if the dimension mappings have changed between old and new sets."
  [old-mappings :- [:maybe [:sequential ::lib-metric.schema/dimension-mapping]]
   new-mappings :- [:sequential ::lib-metric.schema/dimension-mapping]]
  (let [normalize (fn [mappings]
                    (set (map #(update % :target normalize-target) mappings)))]
    (not= (normalize old-mappings) (normalize new-mappings))))

;;; ------------------------------------------------- Entity Accessors -------------------------------------------------
;;; These multimethods provide pure read access to dimensionable entities.
;;; They dispatch on :lib/type and extract data without side effects.

(defmulti dimensionable-query
  "Returns the MBQL query for computing visible-columns for this entity.
   Pure function - only reads data from the entity."
  {:arglists '([entity])}
  :lib/type)

(defmulti get-persisted-dimensions
  "Returns the currently persisted dimensions from the entity.
   Pure function - only reads data from the entity."
  {:arglists '([entity])}
  :lib/type)

(defmulti get-persisted-dimension-mappings
  "Returns the currently persisted dimension mappings from the entity.
   Pure function - only reads data from the entity."
  {:arglists '([entity])}
  :lib/type)

;;; ------------------------------------------------- Public Dimension Fetching API -------------------------------------------------
;;; These functions provide access to dimensions as first-class metadata entities
;;; through the MetricContextMetadataProvider.

(mu/defn dimension :- [:maybe ::lib-metric.schema/metadata-dimension]
  "Fetch a single dimension by UUID from the metadata provider.
   Returns nil if not found."
  [metadata-provider :- ::lib.metadata.protocols/metadata-provider
   dimension-id      :- ::lib-metric.schema/dimension-id]
  (first (lib.metadata.protocols/metadatas
          metadata-provider
          {:lib/type :metadata/dimension :id #{dimension-id}})))

(mu/defn dimensions-for-metric :- [:sequential ::lib-metric.schema/metadata-dimension]
  "Fetch all dimensions for a metric by metric ID."
  [metadata-provider :- ::lib.metadata.protocols/metadata-provider
   metric-id         :- pos-int?]
  (lib.metadata.protocols/metadatas
   metadata-provider
   {:lib/type :metadata/dimension :metric-id metric-id}))

(mu/defn dimensions-for-measure :- [:sequential ::lib-metric.schema/metadata-dimension]
  "Fetch all dimensions for a measure by measure ID."
  [metadata-provider :- ::lib.metadata.protocols/metadata-provider
   measure-id        :- pos-int?]
  (lib.metadata.protocols/metadatas
   metadata-provider
   {:lib/type :metadata/dimension :measure-id measure-id}))

(mu/defn dimensions-for-table :- [:sequential ::lib-metric.schema/metadata-dimension]
  "Fetch all dimensions mapped to a table by table ID.
   This returns dimensions from both metrics and measures that have mappings to the table."
  [metadata-provider :- ::lib.metadata.protocols/metadata-provider
   table-id          :- pos-int?]
  (lib.metadata.protocols/metadatas
   metadata-provider
   {:lib/type :metadata/dimension :table-id table-id}))

;;; ------------------------------------------------- Dimension Resolution -------------------------------------------------
;;; Functions for resolving dimension UUIDs to field IDs through dimension mappings.

(mu/defn get-dimension-or-throw :- :map
  "Find a dimension by its UUID from a list of dimensions.
   Throws 400 if not found."
  [dimensions   :- [:maybe [:sequential :map]]
   dimension-id :- :string]
  (or (m/find-first #(= (:id %) dimension-id) dimensions)
      (throw (ex-info (i18n/tru "Dimension not found: {0}" dimension-id)
                      {:status-code 400
                       :dimension-id dimension-id}))))

(mu/defn get-dimension-mapping-or-throw :- :map
  "Find a dimension mapping by dimension UUID from a list of mappings.
   Throws 400 if not found."
  [dimension-mappings :- [:maybe [:sequential :map]]
   dimension-id       :- :string]
  (or (m/find-first #(= (:dimension-id %) dimension-id) dimension-mappings)
      (throw (ex-info (i18n/tru "Dimension mapping not found for dimension: {0}" dimension-id)
                      {:status-code 400
                       :dimension-id dimension-id}))))

(defn dimension-target->field-id
  "Extract the field ID from a dimension mapping target.
   Returns nil if the target cannot be resolved to a field ID (e.g., uses a name instead).
   Handles both valid and invalid field refs gracefully."
  [target]
  (when (and (vector? target)
             (= :field (first target))
             (>= (count target) 3))
    (let [id-or-name (nth target 2)]
      (when (pos-int? id-or-name)
        id-or-name))))

(mu/defn resolve-dimension-to-field-id :- ::lib.schema.id/field
  "Resolve a dimension UUID to a field ID through the dimension and mapping.
   Validates that the dimension is active (not orphaned) and has a valid mapping.

   Returns the field ID or throws an exception with appropriate error message."
  [dimensions         :- [:maybe [:sequential :map]]
   dimension-mappings :- [:maybe [:sequential :map]]
   dimension-id       :- :string]
  (let [dimension (get-dimension-or-throw dimensions dimension-id)]
    ;; Check for orphaned dimensions
    (when (= (:status dimension) :status/orphaned)
      (throw (ex-info (i18n/tru "Cannot use orphaned dimension: {0}" dimension-id)
                      {:status-code 400
                       :dimension-id dimension-id
                       :dimension-status (:status dimension)})))
    (let [mapping  (get-dimension-mapping-or-throw dimension-mappings dimension-id)
          target   (:target mapping)
          field-id (dimension-target->field-id target)]
      (when-not field-id
        (throw (ex-info (i18n/tru "Cannot resolve dimension target to field ID: {0}" dimension-id)
                        {:status-code 400
                         :dimension-id dimension-id
                         :target target})))
      field-id)))

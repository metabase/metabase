(ns metabase.lib-metric.dimension
  "Core logic for computing and reconciling dimensions from dimensionable entities
   (Measures, Metrics v2, future v3). Dimensions are computed from visible columns
   and reconciled with persisted dimensions on each read."
  (:require
   [medley.core :as m]
   [metabase.lib-metric.schema :as lib-metric.schema]
   [metabase.lib-metric.types.isa :as types.isa]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]
   [metabase.util.performance :as perf]))

;;; ------------------------------------------------- Target Comparison -------------------------------------------------

(defn field-ref->key
  "Canonical, collision-safe map key for an MBQL field (or expression) ref.

   A column's Field ID is **not** unique within a query: a table can have multiple FKs to the same
   foreign table, so the same field id is reachable via different `:source-field` paths. Keying maps
   by field id alone therefore collides — always key by this instead.

   It drops only per-instance/derived opts (`:lib/uuid`, `:effective-type`, `:base-type`) and KEEPS
   everything identity-relevant: the id, the `:source-field`/`:join-alias` that identifies the FK or
   join, and any `:binning`/`:temporal-unit`."
  [[clause-type opts id-or-name]]
  [clause-type
   (dissoc opts :lib/uuid :effective-type :base-type)
   id-or-name])

;;; Backwards-compatible internal alias.
(def ^:private normalize-target field-ref->key)

(defn targets-equal?
  "Compare two target refs for equality, ignoring transient options like :lib/uuid."
  [target-a target-b]
  (= (field-ref->key target-a) (field-ref->key target-b)))

(defn- random-uuid-str []
  (str (random-uuid)))

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
    (seq (:sources dim)) (update :sources #(perf/mapv normalize-dimension-source %))
    (string? (:status dim)) (update :status keyword)
    (string? (:has-field-values dim)) (update :has-field-values keyword)))

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
        (merge (into {} (remove (comp nil? val)) (perf/select-keys persisted-dim [:display-name :semantic-type :effective-type])))
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
                   (-> dim
                       (assoc :status :status/orphaned)
                       (assoc :status-message (orphaned-status-message dim)))))))))

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

(mu/defn reconcile-existing-dimensions :- [:map
                                           [:dimensions [:sequential ::lib-metric.schema/persisted-dimension]]
                                           [:dimension-mappings [:sequential ::lib-metric.schema/dimension-mapping]]]
  "Refresh the status of an already-curated dimension set against the currently computed columns,
   WITHOUT adding new dimensions or overwriting user edits.

   Any persisted dimensions and mappings are authoritative: each persisted dimension is kept as-is, except its
   `:status` is set to `:status/orphaned` (with a message) when its mapped target no longer appears among the computed
   columns, and back to `:status/active` if it reappears. Newly added columns are ignored, and mappings are returned
   unchanged.

   This is used once dimensions have been seeded, so curated edits and removals are never clobbered. Contrast with
   [[reconcile-dimensions-and-mappings]], which is used only to seed when `:dimensions` are nil."
  [computed-pairs     :- [:sequential ::lib-metric.schema/computed-pair]
   persisted-dims     :- [:sequential ::lib-metric.schema/persisted-dimension]
   persisted-mappings :- [:maybe [:sequential ::lib-metric.schema/dimension-mapping]]]
  (let [computed-targets (into #{} (map (comp normalize-target :target :mapping))
                               computed-pairs)
        target-by-dim-id (into {} (map (juxt :dimension-id :target))
                               (or persisted-mappings []))
        active?          #(some->> (:id %)
                                   (get target-by-dim-id)
                                   normalize-target
                                   (contains? computed-targets))]
    {:dimensions         (perf/mapv (fn [dim]
                                      (if (active? dim)
                                        (-> dim
                                            (assoc :status :status/active)
                                            (dissoc :status-message))
                                        (-> dim
                                            (assoc :status :status/orphaned)
                                            (assoc :status-message (orphaned-status-message dim)))))
                                    persisted-dims)
     :dimension-mappings (vec persisted-mappings)}))

(mu/defn extract-persisted-dimensions :- [:sequential ::lib-metric.schema/persisted-dimension]
  "Extract dimensions that should be persisted to the database.
   A dimension should be persisted if it has a status (either active or orphaned)."
  [dimensions :- [:sequential ::lib-metric.schema/persisted-dimension]]
  (filterv :status dimensions))

;;; ---------------------------------------------- Dimension CRUD (pure) ----------------------------------------------
;;; Pure transforms over the persisted dimension/mapping vectors, used by the dimension CRUD
;;; endpoints. They never recompute from columns; the caller supplies computed pairs where needed.

(defn main-group?
  "True when a computed dimension pair belongs to the entity's own (\"main\") table, as opposed to a
   joined/FK-reachable table. Used to decide the default seed set."
  [pair]
  (= "main" (perf/get-in pair [:dimension :group :type])))

(defn pick-default-dimension
  "Pick the preferred default from an ordered collection of dimensions."
  [dimensions]
  (let [dimensions (vec dimensions)]
    (or (u/seek types.isa/date-or-datetime? dimensions)
        (u/seek #(or (types.isa/country? %) (types.isa/state? %)) dimensions)
        (u/seek #(or (= :list (:has-field-values %))
                     (types.isa/category? %))
                dimensions)
        (first dimensions))))

(defn addable-pairs
  "Computed dimension pairs whose target is not already mapped by one of `persisted-mappings` — i.e. the columns
  available to add to the curated set."
  [computed-pairs persisted-mappings]
  (let [mapped-target? (into #{} (map (comp normalize-target :target)) persisted-mappings)]
    (into []
          (remove #(-> % :mapping :target normalize-target mapped-target?))
          computed-pairs)))

(defn add-dimensions
  "Append `pairs` (each `{:dimension ... :mapping ...}`, with `:id`/`:dimension-id` already assigned)
   to the persisted set, marking each added dimension `:status/active`. Pairs whose dimension `:id`
   is already present are skipped, so adding is idempotent. Returns
   `{:dimensions ... :dimension-mappings ...}`."
  [persisted-dims persisted-mappings pairs]
  (let [existing-ids (into #{} (map :id) persisted-dims)
        new-pairs    (remove #(contains? existing-ids (-> % :dimension :id)) pairs)]
    {:dimensions         (into (vec persisted-dims)
                               (comp (map :dimension)
                                     (map #(assoc % :status :status/active)))
                               new-pairs)
     :dimension-mappings (into (vec persisted-mappings) (map :mapping) new-pairs)}))

(defn remove-dimensions
  "Drop the dimensions (and their mappings) whose id is in `ids` from the persisted set.
   Returns `{:dimensions ... :dimension-mappings ...}`."
  [persisted-dims persisted-mappings ids]
  (let [ids (set ids)]
    {:dimensions         (into [] (remove (comp ids :id))           persisted-dims)
     :dimension-mappings (into [] (remove (comp ids :dimension-id)) persisted-mappings)}))

(defn- update-dimension*
  "Applies the `updates` to the dimension. See [[update-dimension]] for the details."
  [dim {:keys [display-name source-pair] :as updates}]
  (cond-> dim
    (some? display-name)             (assoc :display-name display-name)
    (contains? updates :description) (assoc :description (:description updates))
    source-pair                      (merge (perf/select-keys (:dimension source-pair)
                                                              [:name :sources :effective-type
                                                               :semantic-type :has-field-values :group]))))

(defn- update-dimension-mapping
  "Applies any repointing to a dimension's mapping."
  [mapping {{:keys [table-id target]} :mapping :as _source-pair}]
  (-> mapping
      (assoc :target target)
      (u/assoc-dissoc :table-id table-id)))

(defn update-dimension
  "Update a single persisted dimension by `id`. `updates` may contain:
   - `:display-name` — set the display name
   - `:description`  — set the description (key present, even when nil, clears it)
   - `:source-pair`  — a computed `{:dimension ... :mapping ...}` for a new source column; copies the
     column-derived fields onto the dimension and repoints its mapping target.
   Returns `{:dimensions ... :dimension-mappings ...}`."
  [persisted-dims persisted-mappings id {:keys [source-pair] :as updates}]
  (let [dims-by-id         (-> (m/index-by :id persisted-dims)
                               (update id update-dimension* updates))
        mappings-by-dim-id (cond-> (m/index-by :dimension-id persisted-mappings)
                             source-pair (update id update-dimension-mapping source-pair))]
    {:dimensions         (perf/mapv (comp dims-by-id :id)
                                    persisted-dims)
     :dimension-mappings (perf/mapv (comp mappings-by-dim-id :dimension-id)
                                    persisted-mappings)}))

(defn set-default-dimension
  "Mark the dimension with `id` as the sole default, clearing `:default` from every other dimension,
   so at most one dimension is ever the default. `id` is assumed to exist (the caller validates).
   Returns the updated dimensions vector."
  [persisted-dims id]
  (perf/mapv (fn [dim]
               (if (= id (:id dim))
                 (assoc dim :default true)
                 (dissoc dim :default)))
             persisted-dims))

(defn reorder-dimensions
  "Sort `persisted-dims` into the order given by `ids`. Dimensions not listed keep their relative
   order after the listed ones (a permission-filtered client may not see every dimension).
   Returns the reordered dimensions vector."
  [persisted-dims ids]
  (let [position (into {} (map-indexed (fn [i id] [id i])) ids)
        missing  (count ids)]
    ;; sort-by is stable, so unlisted dimensions (all sharing the `missing` index) keep their order.
    (vec (sort-by #(get position (:id %) missing) persisted-dims))))

(def ^:private persisted-dimension-keys
  [:id :name :display-name :semantic-type :effective-type :has-field-values :status :status-message :sources :group :default])

(defn- dimensions-set [dims]
  (into #{} (map #(perf/select-keys % persisted-dimension-keys)) dims))

(mu/defn dimensions-changed? :- :boolean
  "Check if the persisted dimensions have changed between old and new sets."
  [old-persisted :- [:maybe [:sequential ::lib-metric.schema/persisted-dimension]]
   new-persisted :- [:sequential ::lib-metric.schema/persisted-dimension]]
  (not= (dimensions-set old-persisted) (dimensions-set new-persisted)))

(defn- mappings-set [mappings]
  (into #{} (map #(update % :target normalize-target))
        mappings))

(mu/defn mappings-changed? :- :boolean
  "Check if the dimension mappings have changed between old and new sets."
  [old-mappings :- [:maybe [:sequential ::lib-metric.schema/dimension-mapping]]
   new-mappings :- [:sequential ::lib-metric.schema/dimension-mapping]]
  (not= (mappings-set old-mappings) (mappings-set new-mappings)))

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
   Pure function - only reads data from the entity.
   Default implementation reads `:dimensions` and normalizes them."
  {:arglists '([entity])}
  :lib/type)

(defmethod get-persisted-dimensions :default
  [entity]
  (some->> (:dimensions entity)
           (perf/mapv normalize-persisted-dimension)))

(defmulti get-persisted-dimension-mappings
  "Returns the currently persisted dimension mappings from the entity.
   Pure function - only reads data from the entity.
   Default implementation reads `:dimension-mappings`."
  {:arglists '([entity])}
  :lib/type)

(defmethod get-persisted-dimension-mappings :default
  [entity]
  (:dimension-mappings entity))

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
   {:lib/type :metadata/dimension :table-ids #{table-id}}))

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

(mu/defn reference :- ::lib-metric.schema/dimension-reference
  "Constructs a reference to the dimension passed in. If it is already a reference, returns it as-is."
  [dimension :- ::lib-metric.schema/dimension-or-reference]
  (if (map? dimension)
    (lib/ensure-uuid [:dimension {} (:id dimension)])
    (lib/ensure-uuid dimension)))

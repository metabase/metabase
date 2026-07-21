(ns metabase.metrics.core
  "Core namespace for metrics functionality including dimension hydration.
   Contains persistence multimethod and orchestration logic."
  (:require
   [clojure.string :as str]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib-metric.core :as lib-metric]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.metrics.dimension :as metrics.dimension]
   [metabase.metrics.permissions :as metrics.perms]
   [metabase.metrics.transforms :as metrics.transforms]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.namespaces :as shared.ns]))

;;; ------------------------------------------------- Re-exports --------------------------------

(shared.ns/import-fns
 [metrics.dimension
  dimension-values
  dimension-search-values
  dimension-remapped-value]
 [metrics.perms
  filter-dimensions-for-user]
 [metrics.transforms
  normalize-dimension
  normalize-target-ref
  normalize-dimension-mapping
  transform-dimensions
  transform-dimension-mappings
  export-dimensions
  import-dimensions
  export-dimension-mappings
  import-dimension-mappings
  dimension-mappings-deps])

;;; ------------------------------------------------- Query Utilities -------------------------------------------------

(defn aggregation-column-name
  "Extract the result column name for the first aggregation in a query.
   `database-id` is the ID of the database, `query-map` is the dataset_query or definition."
  [database-id query-map]
  (try
    (let [mp    (lib-be/application-database-metadata-provider database-id)
          query (lib/query mp query-map)
          agg   (->> (lib/returned-columns query)
                     (filter #(= (:lib/source %) :source/aggregations))
                     first)]
      (:name agg))
    (catch Exception _ nil)))

;;; ------------------------------------------------- Persistence Multimethod -------------------------------------------------

(defmulti save-dimensions!
  "Persists dimensions and dimension-mappings to the entity's storage.
   This is the only impure operation - it writes to the database."
  {:arglists '([entity dimensions dimension-mappings])}
  (fn [entity _dimensions _dimension-mappings] (:lib/type entity)))

(defmulti dimensions-initialized?
  "Whether an entity's dimensions have been initialized in durable storage."
  {:arglists '([entity])}
  :lib/type)

(defmethod dimensions-initialized? :default
  [entity]
  (some? (lib-metric/get-persisted-dimensions entity)))

;;; ------------------------------------------------- Hydration -------------------------------------------------

(defn- save-dimensions-if-changed!
  "Persist `new-dims`/`new-mappings` only when they differ from the currently stored set."
  [entity old-dims old-mappings new-dims new-mappings]
  (when (or (lib-metric/dimensions-changed? old-dims new-dims)
            (lib-metric/mappings-changed? old-mappings new-mappings))
    (save-dimensions! entity new-dims new-mappings)))

(defn- sync-measure-dimensions!
  "Measures are fully synced on every load: recompute from the visible columns and reconcile with the
   persisted set — preserving the UUIDs (and user edits) of dimensions that already existed, adding
   new columns, and marking removed columns `:status/orphaned`. Measures have no curation API."
  [entity computed-pairs persisted-dims persisted-mappings]
  (let [{:keys [dimensions dimension-mappings]}
        (lib-metric/reconcile-dimensions-and-mappings computed-pairs persisted-dims persisted-mappings)]
    (save-dimensions-if-changed! entity
                                 (lib-metric/extract-persisted-dimensions (or persisted-dims []))
                                 persisted-mappings
                                 (lib-metric/extract-persisted-dimensions dimensions)
                                 dimension-mappings)))

(defn compute-full-dimension-set
  "Compute the FULL dimension set for a metric's `query` — its own-table columns PLUS every
   implicitly-joined (FK-reachable) column — in the persisted `{:dimensions ... :dimension-mappings ...}`
   shape (or `nil` when `query` is blank).

   New metrics seed their own-table columns only (see [[seed-metric-dimensions!]]), but metrics that
   predate curated dimensions implicitly exposed every breakoutable column. This reproduces that full
   set, so such a metric keeps all of its historical dimensions when it is modernized on read (used by
   the `:model/Card` schema upgrade for pre-curation metrics)."
  [query]
  (when (seq query)
    (let [computed-pairs (lib-metric/compute-dimension-pairs (lib-metric/metadata-provider) query)
          {:keys [dimensions dimension-mappings]}
          (lib-metric/reconcile-dimensions-and-mappings computed-pairs nil nil)]
      {:dimensions         (lib-metric/extract-persisted-dimensions dimensions)
       :dimension-mappings dimension-mappings})))

(defn- seed-metric-dimensions!
  "First initialization of a v2 metric: seed dimensions from the entity's own (main-table) columns
   only. Joinable/FK columns are not added by default — they remain available to add via the
   dimension CRUD endpoints."
  [entity computed-pairs]
  (let [seed-pairs (filterv lib-metric/main-group? computed-pairs)
        {:keys [dimensions dimension-mappings]}
        (lib-metric/reconcile-dimensions-and-mappings seed-pairs nil nil)
        dimensions (lib-metric/extract-persisted-dimensions dimensions)
        default-dimension (lib-metric/pick-default-dimension dimensions)
        dimensions (cond-> dimensions
                     default-dimension (lib-metric/set-default-dimension (:id default-dimension)))]
    (save-dimensions! entity
                      dimensions
                      dimension-mappings)))

(defn- refresh-metric-dimensions!
  "A v2 metric that already has curated dimensions: the stored dimensions/mappings are authoritative
   (never re-added, overwritten, or auto-extended); only `:status` is refreshed (a dimension whose
   column disappeared becomes `:status/orphaned`, and back to `:status/active` if it returns)."
  [entity computed-pairs persisted-dims persisted-mappings]
  (let [{:keys [dimensions dimension-mappings]}
        (lib-metric/reconcile-existing-dimensions computed-pairs persisted-dims persisted-mappings)]
    (save-dimensions-if-changed! entity persisted-dims persisted-mappings dimensions dimension-mappings)))

(defn sync-dimensions!
  "Sync an entity's dimensions to the database. Behaviour differs by entity type:

   - `:metadata/measure` — fully synced on every load; see [[sync-measure-dimensions!]].
   - `:metadata/metric` (v2 Cards) — curated; seeded once via [[seed-metric-dimensions!]], then kept
     authoritative via [[refresh-metric-dimensions!]]. Curation happens via the dimension CRUD endpoints.

   Arguments:
   - `metadata-type` - `:metadata/metric` or `:metadata/measure`
   - `id` - the entity ID

   Only handles the side-effect of syncing to the database; callers fetch the entity separately."
  [metadata-type id]
  (when-let [entity (first (lib.metadata.protocols/metadatas
                            (lib-metric/metadata-provider)
                            {:lib/type metadata-type :id #{id}}))]
    (when-let [query (lib-metric/dimensionable-query entity)]
      (let [computed-pairs     (lib-metric/compute-dimension-pairs (lib-metric/metadata-provider) query)
            persisted-dims     (lib-metric/get-persisted-dimensions entity)
            persisted-mappings (lib-metric/get-persisted-dimension-mappings entity)]
        (case metadata-type
          :metadata/measure
          (sync-measure-dimensions! entity computed-pairs persisted-dims persisted-mappings)

          :metadata/metric
          (if (dimensions-initialized? entity)
            (refresh-metric-dimensions! entity computed-pairs persisted-dims persisted-mappings)
            (if (nil? persisted-dims)
              (seed-metric-dimensions! entity computed-pairs)
              (save-dimensions! entity
                                (lib-metric/extract-persisted-dimensions persisted-dims)
                                persisted-mappings))))))))

;;; ------------------------------------------------- Dimension CRUD -------------------------------------------------
;;; Orchestration behind the dimension-editor endpoints. Each function loads the dimensionable entity
;;; (measure / metric) by its metadata-type + id, mutates the curated dimension set, persists via
;;; `save-dimensions!`, and returns API-shaped dimensions. Authorization is performed by the API layer.

(defn- dimension-entity
  "Fetch the dimensionable entity metadata (`:metadata/metric` or `:metadata/measure`) by id."
  [metadata-type id]
  (or (first (lib.metadata.protocols/metadatas
              (lib-metric/metadata-provider)
              {:lib/type metadata-type :id #{id}}))
      (throw (ex-info (tru "Not found.") {:status-code 404}))))

(defn- entity-computed-pairs
  "All computed dimension pairs (main + connection groups) for an entity's query, or `[]`."
  [entity]
  (if-let [query (lib-metric/dimensionable-query entity)]
    (lib-metric/compute-dimension-pairs (lib-metric/metadata-provider) query)
    []))

(defn- pair->field-id
  "Field id targeted by a computed pair's mapping, if any."
  [pair]
  (let [target (-> pair :mapping :target)]
    (when (and (vector? target) (= :field (first target)) (>= (count target) 3))
      (let [id (nth target 2)]
        (when (pos-int? id) id)))))

(defn- search-matches?
  "True when `query` is blank or appears (case-insensitively) in the dimension's display/name."
  [query dim]
  (or (str/blank? query)
      (let [q (u/lower-case-en query)]
        (boolean (some #(and % (str/includes? (u/lower-case-en %) q))
                       [(:display-name dim) (:name dim)])))))

(defn- added-dimensions
  "Perm-filter persisted dims/mappings for the current user and return them as API dimensions."
  [dims mappings]
  (->> (metrics.perms/filter-dimensions-for-user {:dimensions (vec dims) :dimension_mappings (vec mappings)})
       :dimensions
       (mapv metrics.dimension/->api-dimension)))

(defn- addable-groups
  "Group addable computed pairs by their column group, assigning each a fresh random UUID, and
   return the API `[{:group ... :dimensions [...]}]` shape."
  [pairs]
  (->> pairs
       (map (fn [{:keys [dimension]}] (assoc dimension :id (str (random-uuid)))))
       (group-by :group)
       (mapv (fn [[group dims]]
               {:group      (metrics.dimension/->api-group group)
                :dimensions (mapv metrics.dimension/->api-dimension dims)}))))

(defn list-dimensions
  "List a metric/measure's curated (`:added`) dimensions and, when `with-addable?`, the columns still
   available to add (`:addable`, grouped by source table). Both are filtered by `query` (a name
   substring) and by the current user's permissions."
  [metadata-type id {:keys [query with-addable?]}]
  (let [entity             (dimension-entity metadata-type id)
        persisted-dims     (or (lib-metric/get-persisted-dimensions entity) [])
        persisted-mappings (or (lib-metric/get-persisted-dimension-mappings entity) [])
        added              (added-dimensions (filterv #(search-matches? query %) persisted-dims)
                                             persisted-mappings)]
    {:added   added
     :addable (if with-addable?
                (->> (lib-metric/addable-pairs (entity-computed-pairs entity) persisted-mappings)
                     (filter #(search-matches? query (:dimension %)))
                     addable-groups)
                [])}))

(defn add-dimensions!
  "Add the given dimensions (full API dimension objects, each carrying its UUID and a single
   `:sources` field id) to a metric/measure. The column-derived fields and mapping are recomputed
   server-side from the entity's columns; only the UUID, display name, and description come from the
   request. Returns the updated `:added` list."
  [metadata-type id api-dims]
  (let [entity             (dimension-entity metadata-type id)
        pair-by-field-id   (into {} (keep (fn [p] (when-let [fid (pair->field-id p)] [fid p])))
                                 (entity-computed-pairs entity))
        persisted-dims     (or (lib-metric/get-persisted-dimensions entity) [])
        persisted-mappings (or (lib-metric/get-persisted-dimension-mappings entity) [])
        pairs              (keep (fn [d]
                                   (when-let [pair (get pair-by-field-id (-> d :sources first :field-id))]
                                     {:dimension (cond-> (assoc (:dimension pair) :id (:id d))
                                                   (:display_name d)             (assoc :display-name (:display_name d))
                                                   (contains? d :description)    (assoc :description (:description d)))
                                      :mapping   (assoc (:mapping pair) :dimension-id (:id d))}))
                                 api-dims)
        {:keys [dimensions dimension-mappings]}
        (lib-metric/add-dimensions persisted-dims persisted-mappings pairs)
        added?              (> (count dimensions) (count persisted-dims))
        default-dimension   (when (and added? (not-any? :default dimensions))
                              (lib-metric/pick-default-dimension
                               (remove #(= :status/orphaned (:status %)) dimensions)))
        dimensions          (cond-> dimensions
                              default-dimension
                              (lib-metric/set-default-dimension (:id default-dimension)))]
    (save-dimensions! entity dimensions dimension-mappings)
    (added-dimensions dimensions dimension-mappings)))

(defn remove-dimensions!
  "Remove dimensions (by UUID) from a metric/measure. Returns the updated `:added` list."
  [metadata-type id dimension-ids]
  (let [entity             (dimension-entity metadata-type id)
        persisted-dims     (or (lib-metric/get-persisted-dimensions entity) [])
        persisted-mappings (or (lib-metric/get-persisted-dimension-mappings entity) [])
        removed-ids        (set dimension-ids)
        removed-default?   (some #(and (:default %) (removed-ids (:id %))) persisted-dims)
        {:keys [dimensions dimension-mappings]}
        (lib-metric/remove-dimensions persisted-dims persisted-mappings dimension-ids)
        next-default       (when removed-default?
                             (lib-metric/pick-default-dimension
                              (remove #(= :status/orphaned (:status %)) dimensions)))
        dimensions         (cond-> dimensions
                             next-default (lib-metric/set-default-dimension (:id next-default)))]
    (save-dimensions! entity dimensions dimension-mappings)
    (added-dimensions dimensions dimension-mappings)))

(defn reorder-dimensions!
  "Persist a new ordering for a metric/measure's dimensions. `dimension-ids` is the desired order;
   dimensions not listed keep their relative order after the listed ones. Mappings are untouched.
   Returns the updated `:added` list."
  [metadata-type id dimension-ids]
  (let [entity             (dimension-entity metadata-type id)
        persisted-dims     (or (lib-metric/get-persisted-dimensions entity) [])
        persisted-mappings (or (lib-metric/get-persisted-dimension-mappings entity) [])
        dimensions         (lib-metric/reorder-dimensions persisted-dims dimension-ids)]
    (save-dimensions! entity dimensions persisted-mappings)
    (added-dimensions dimensions persisted-mappings)))

(defn update-dimension!
  "Update a single dimension's `display_name`, `description`, and/or source column (`source` is a
   `{:type :field-id}`). Changing the source column is only allowed to a column of the same effective
   type. Returns the updated API dimension."
  [metadata-type id dimension-id {:keys [display_name source] :as body}]
  (let [entity             (dimension-entity metadata-type id)
        persisted-dims     (or (lib-metric/get-persisted-dimensions entity) [])
        persisted-mappings (or (lib-metric/get-persisted-dimension-mappings entity) [])
        current            (or (u/seek #(= dimension-id (:id %)) persisted-dims)
                               (throw (ex-info (tru "Dimension not found.") {:status-code 404})))
        source-pair        (when source
                             (let [pair (u/seek #(= (:field-id source) (pair->field-id %))
                                                (entity-computed-pairs entity))]
                               (when-not pair
                                 (throw (ex-info (tru "Source column is not available for this metric.")
                                                 {:status-code 400})))
                               (when (and (:effective-type current)
                                          (not= (:effective-type current)
                                                (-> pair :dimension :effective-type)))
                                 (throw (ex-info (tru "Cannot change a dimension''s source column to one of a different type.")
                                                 {:status-code 400})))
                               pair))
        updates            (cond-> {}
                             (some? display_name)          (assoc :display-name display_name)
                             (contains? body :description) (assoc :description (:description body))
                             source-pair                   (assoc :source-pair source-pair))
        {:keys [dimensions dimension-mappings]}
        (lib-metric/update-dimension persisted-dims persisted-mappings dimension-id updates)]
    (save-dimensions! entity dimensions dimension-mappings)
    (some-> (u/seek #(= dimension-id (:id %)) dimensions)
            metrics.dimension/->api-dimension)))

(defn set-default-dimension!
  "Mark `dimension-id` as the entity's sole default dimension, clearing any previous default. It is
   legal for an entity to have no default (e.g. right after seeding, or once the default is removed);
   this endpoint always leaves exactly one. Returns the updated `:added` list."
  [metadata-type id dimension-id]
  (let [entity             (dimension-entity metadata-type id)
        persisted-dims     (or (lib-metric/get-persisted-dimensions entity) [])
        persisted-mappings (or (lib-metric/get-persisted-dimension-mappings entity) [])
        current            (or (u/seek #(= dimension-id (:id %)) persisted-dims)
                               (throw (ex-info (tru "Dimension not found.") {:status-code 404})))
        _                  (when (= :status/orphaned (:status current))
                             (throw (ex-info (tru "Cannot set an orphaned dimension as the default.")
                                             {:status-code 400})))
        dimensions         (lib-metric/set-default-dimension persisted-dims dimension-id)]
    (save-dimensions! entity dimensions persisted-mappings)
    (added-dimensions dimensions persisted-mappings)))

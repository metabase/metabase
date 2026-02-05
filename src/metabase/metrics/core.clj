(ns metabase.metrics.core
  "Core namespace for metrics functionality including dimension hydration.
   Contains persistence multimethod and orchestration logic."
  (:require
   [metabase.lib-metric.core :as lib-metric]
   [toucan2.core :as t2]))

;;; ------------------------------------------------- Persistence Multimethod -------------------------------------------------

(defmulti save-dimensions!
  "Persists dimensions and dimension-mappings to the entity's storage.
   This is the only impure operation - it writes to the database."
  {:arglists '([entity dimensions dimension-mappings])}
  (fn [entity _dimensions _dimension-mappings] (:lib/type entity)))

;;; ------------------------------------------------- Hydration -------------------------------------------------

(defn sync-dimensions!
  "Compute dimensions from visible-columns, reconcile with persisted data,
   and persist to the database if changed.

   Arguments:
   - `metadata-type` - the metadata type, either `:metadata/metric` or `:metadata/measure`
   - `id` - the entity ID

   This function only handles the side-effect of syncing dimensions to the database.
   Callers should fetch the entity separately after calling this function."
  [metadata-type id]
  (when-let [entity (first (t2/select metadata-type :id id))]
    (when-let [query (lib-metric/dimensionable-query entity)]
      (let [mp                 (lib-metric/metadata-provider)
            computed-pairs     (lib-metric/compute-dimension-pairs mp query)
            persisted-dims     (lib-metric/get-persisted-dimensions entity)
            persisted-mappings (lib-metric/get-persisted-dimension-mappings entity)

            {:keys [dimensions dimension-mappings]}
            (lib-metric/reconcile-dimensions-and-mappings
             computed-pairs persisted-dims persisted-mappings)

            old-persisted (lib-metric/extract-persisted-dimensions
                           (or persisted-dims []))
            new-persisted (lib-metric/extract-persisted-dimensions
                           dimensions)]
        (when (or (lib-metric/dimensions-changed? old-persisted new-persisted)
                  (lib-metric/mappings-changed? persisted-mappings dimension-mappings))
          (save-dimensions! entity new-persisted dimension-mappings))))))

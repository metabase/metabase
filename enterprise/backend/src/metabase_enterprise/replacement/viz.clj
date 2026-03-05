(ns metabase-enterprise.replacement.viz
  (:require
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.field.resolution :as lib.field.resolution]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.util :as lib.util]
   [metabase.models.visualization-settings :as vs]))

(defn update-card-viz-settings
  [query
   viz-settings]
  (letfn [(ref->maybe-name [ref]
            (when (lib.util/field-clause? ref)
              (when-let [column (lib.field.resolution/resolve-field-ref query -1 ref)]
                (when-not (:lib.field.resolution/fallback-metadata? column)
                  ((some-fn :lib/deduplicated-name :name) column)))))
          (legacy-ref-or-name->name [ref-or-name]
            (or (when (and (vector? ref-or-name) (= :field (keyword (first ref-or-name))))
                  (-> ref-or-name lib/->pMBQL ref->maybe-name))
                ref-or-name))
          (legacy-refs-or-names->names [refs-or-names]
            (into [] (keep legacy-ref-or-name->name) refs-or-names))
          (column-setting->maybe-ref [#::vs{:keys [field-id field-metadata]}]
            (some-> (lib.metadata/field query field-id)
                    lib.ref/ref
                    (lib.options/update-options merge field-metadata)))
          (update-column-settings [column-settings]
            (m/map-kv (fn [k v]
                        (or (when (::vs/field-id k)
                              (when-some [ref (column-setting->maybe-ref k)]
                                (when-some [name (ref->maybe-name ref)]
                                  [{::vs/column-name name} v])))
                            [k v]))
                      column-settings))
          (update-column-formatting [column-formatting]
            (into [] (map #(m/update-existing % :columns legacy-refs-or-names->names)) column-formatting))]
    (-> viz-settings
        (m/update-existing ::vs/column-settings update-column-settings)
        (m/update-existing :table.column_formatting update-column-formatting)
        (m/update-existing-in [:pivot_table.column_split :rows] legacy-refs-or-names->names)
        (m/update-existing-in [:pivot_table.column_split :columns] legacy-refs-or-names->names)
        (m/update-existing-in [:pivot_table.column_split :values] legacy-refs-or-names->names)
        (m/update-existing-in [:pivot_table.collapsed_rows :rows] legacy-refs-or-names->names))))

(defn click-behavior->card-id
  [click-behavior]
  (when (= ::vs/question (::vs/link-type click-behavior))
    (::vs/link-target-id click-behavior)))

(defn dashcard-viz-settings->card-ids
  [viz-settings]
  (concat
   ;; global click behavior (non-table cards)
   (when-let [id (click-behavior->card-id (::vs/click-behavior viz-settings))]
     [id])
   ;; per-column click behaviors
   (keep (fn [[_col-key col-viz]]
           (click-behavior->card-id (::vs/click-behavior col-viz)))
         (::vs/column-settings viz-settings))))

(defn update-dashcard-viz-settings
  [viz-settings card-id->query update-fn]
  (letfn [(update-mapping [query mapping]
            (let [target (::vs/param-mapping-target mapping)]
              (if-let [dimension (::vs/param-dimension target)]
                (let [dimension' (update-fn query dimension)]
                  (assoc-in mapping [::vs/param-mapping-target ::vs/param-dimension] dimension'))
                mapping)))
          (update-click-behavior [click-behavior]
            (or (when-let [card-id (click-behavior->card-id click-behavior)]
                  (when-let [query (get card-id->query card-id)]
                    (m/update-existing click-behavior ::vs/parameter-mapping
                                       (fn [mappings]
                                         (m/map-vals #(update-mapping query %) mappings)))))
                click-behavior))
          (update-column-settings [col-settings]
            (m/map-vals #(m/update-existing % ::vs/click-behavior update-click-behavior)
                        col-settings))]
    (-> viz-settings
        (m/update-existing ::vs/click-behavior update-click-behavior)
        (m/update-existing ::vs/column-settings update-column-settings))))

(ns metabase-enterprise.replacement.walk
  (:require
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.util :as lib.util]
   [metabase.models.visualization-settings :as vs]))

(set! *warn-on-reflection* true)

(defn parameter-mapping-card-ids
  "Get all card IDs referenced by the parameter mappings."
  [parameter-mappings]
  (into #{} (keep :card_id) parameter-mappings))

(defn walk-parameter-mapping-targets
  "Walk the parameter mappings and update the targets using the provided function.

  `target-fn` will be called with a parameter target and a card ID and should return a new parameter target."
  [parameter-mappings target-fn]
  (mapv (fn [mapping]
          (or (when-some [card-id (:card_id mapping)]
                (when-some [target' (target-fn (:target mapping) card-id)]
                  (assoc mapping :target target')))
              mapping))
        parameter-mappings))

(defn walk-viz-settings-refs
  "Walk the viz settings and update the refs using the provided function.

  `ref-fn` will be called with a ref and should return either a string or a new ref."
  [viz-settings
   ref-fn]
  (letfn [(update-legacy-ref-or-name [ref-or-name]
            (or (when (vector? ref-or-name)
                  (when-some [ref (try (lib/->pMBQL ref-or-name) (catch Exception _ nil))]
                    (when-some [ref-or-name' (ref-fn ref)]
                      (cond
                        (string? ref-or-name')
                        ref-or-name'
                        (lib.util/clause? ref-or-name')
                        (lib/->legacy-MBQL ref-or-name')))))
                ref-or-name))
          (update-legacy-refs-or-names [refs-or-names]
            (into [] (keep update-legacy-ref-or-name) refs-or-names))
          (column-setting-ref [#::vs{:keys [field-id field-metadata]}]
            (-> [:field (or field-metadata {}) field-id]
                lib/ensure-uuid))
          (update-column-setting [k v]
            (or (when (::vs/field-id k)
                  (let [ref (column-setting-ref k)]
                    (when-some [new-ref-or-name (ref-fn ref)]
                      (cond
                        (string? new-ref-or-name)
                        [{::vs/column-name new-ref-or-name} v]
                        (lib.util/field-clause? new-ref-or-name)
                        [{::vs/field-id (lib/field-ref-id new-ref-or-name)
                          ::vs/field-metadata (lib/options new-ref-or-name)} v]))))
                [k v]))
          (update-column-settings [column-settings]
            (m/map-kv update-column-setting column-settings))
          (update-column-formatting [column-formatting]
            (into [] (map #(m/update-existing % :columns update-legacy-refs-or-names)) column-formatting))]
    (-> viz-settings
        (m/update-existing ::vs/column-settings update-column-settings)
        (m/update-existing :table.column_formatting update-column-formatting)
        (m/update-existing-in [:pivot_table.column_split :rows] update-legacy-refs-or-names)
        (m/update-existing-in [:pivot_table.column_split :columns] update-legacy-refs-or-names)
        (m/update-existing-in [:pivot_table.column_split :values] update-legacy-refs-or-names)
        (m/update-existing-in [:pivot_table.collapsed_rows :rows] update-legacy-refs-or-names))))

(defn- click-behavior-card-id
  [click-behavior]
  (when (= ::vs/question (::vs/link-type click-behavior))
    (::vs/link-target-id click-behavior)))

(defn viz-settings-click-behavior-card-ids
  "Get all card IDs referenced by the click behaviors in the viz settings."
  [viz-settings]
  (into #{}
        (concat
         ;; global click behavior (non-table cards)
         (when-some [id (click-behavior-card-id (::vs/click-behavior viz-settings))]
           [id])
         ;; per-column click behaviors
         (keep (fn [[_col-key col-viz]]
                 (click-behavior-card-id (::vs/click-behavior col-viz)))
               (::vs/column-settings viz-settings)))))

(defn walk-viz-settings-click-behaviors
  "Walk the click behaviors in the viz settings and update the targets using the provided function.

  `target-fn` will be called with a parameter target and a card ID and should return a new parameter target."
  [viz-settings target-fn]
  (letfn [(update-mapping [card-id mapping]
            (or (when-some [target (some-> mapping ::vs/param-mapping-target ::vs/param-dimension)]
                  (when-some [target' (target-fn target card-id)]
                    (assoc-in mapping [::vs/param-mapping-target ::vs/param-dimension] target')))
                mapping))
          (update-click-behavior [click-behavior]
            (or (when-some [card-id (click-behavior-card-id click-behavior)]
                  (m/update-existing click-behavior ::vs/parameter-mapping
                                     (fn [mappings]
                                       (m/map-vals #(update-mapping card-id %) mappings))))
                click-behavior))
          (update-column-settings [col-settings]
            (m/map-vals #(m/update-existing % ::vs/click-behavior update-click-behavior)
                        col-settings))]
    (-> viz-settings
        (m/update-existing ::vs/click-behavior update-click-behavior)
        (m/update-existing ::vs/column-settings update-column-settings))))

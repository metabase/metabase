(ns metabase-enterprise.replacement.walk
  (:require
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util :as lib.util]
   [metabase.models.visualization-settings :as vs]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn parameter-source-card-ids :- [:set ::lib.schema.id/card]
  "Get all card IDs referenced by `:values_source_config` in the given parameters."
  [parameters :- [:sequential :map]]
  (into #{} (keep #(-> % :values_source_config :card_id)) parameters))

(mu/defn walk-parameter-source-card-ids :- [:sequential :map]
  "Walk the parameters and update the card IDs in `:values_source_config` using the provided function.

  `card-id-fn` will be called with a card ID and should return a new card ID."
  [parameters :- [:sequential :map]
   card-id-fn :- fn?]
  (mapv #(m/update-existing % :values_source_config :card_id card-id-fn) parameters))

(mu/defn walk-parameter-source-card-refs :- [:sequential :map]
  "Walk the parameters and update the refs in `:value_field` and `:label_field` 
  in the `:values_source_config` using the provided function.

  `ref-fn` will be called with a ref and a card ID and should return a new ref."
  [parameters :- [:sequential :map]
   ref-fn       :- fn?]
  (letfn [(update-legacy-ref [legacy-ref card-id]
            (if-some [ref (try (lib/->pMBQL legacy-ref) (catch Exception _ nil))]
              (-> ref (ref-fn card-id) lib/->legacy-MBQL)
              legacy-ref))]
    (mapv (fn [parameter]
            (if-some [card-id (-> parameter :values_source_config :card_id)]
              (-> parameter
                  (m/update-existing-in [:values_source_config :value_field] #(update-legacy-ref % card-id))
                  (m/update-existing-in [:values_source_config :label_field] #(update-legacy-ref % card-id)))
              parameter))
          parameters)))

(mu/defn parameter-mapping-card-ids :- [:set ::lib.schema.id/card]
  "Get all card IDs referenced by the parameter mappings."
  [parameter-mappings :- [:sequential :map]]
  (into #{} (keep :card_id) parameter-mappings))

(mu/defn walk-parameter-mapping-targets :- [:sequential :map]
  "Walk the parameter mappings and update the targets using the provided function.

  `target-fn` will be called with a parameter target and a card ID and should return a new parameter target."
  [parameter-mappings :- [:sequential :map]
   target-fn          :- fn?]
  (mapv (fn [mapping]
          (or (when-some [card-id (:card_id mapping)]
                (when-some [target' (target-fn (:target mapping) card-id)]
                  (assoc mapping :target target')))
              mapping))
        parameter-mappings))

(mu/defn walk-viz-settings-refs :- :map
  "Walk the viz settings and update the refs using the provided function.

  `ref-fn` will be called with a ref and should return either a string or a new ref."
  [viz-settings :- :map
   ref-fn       :- fn?]
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

(mu/defn click-behavior-card-id :- [:maybe ::lib.schema.id/card]
  [click-behavior :- :map]
  (when (= ::vs/question (::vs/link-type click-behavior))
    (::vs/link-target-id click-behavior)))

(mu/defn viz-settings-click-behavior-card-ids :- [:set ::lib.schema.id/card]
  "Get all card IDs referenced by the click behaviors in the viz settings."
  [viz-settings :- :map]
  (into #{}
        (concat
         ;; global click behavior (non-table cards)
         (when-some [id (some-> viz-settings ::vs/click-behavior click-behavior-card-id)]
           [id])
         ;; per-column click behaviors
         (keep (fn [[_col-key col-viz]]
                 (some-> col-viz ::vs/click-behavior click-behavior-card-id))
               (::vs/column-settings viz-settings)))))

(mu/defn walk-viz-settings-click-behaviors :- :map
  "Walk the click behaviors in the viz settings and update the targets using the provided function.

  `target-fn` will be called with a parameter target and a card ID and should return a new parameter target."
  [viz-settings :- :map
   target-fn    :- fn?]
  (letfn [(update-mapping [card-id mapping]
            (or (when-some [target (some-> mapping ::vs/param-mapping-target ::vs/param-dimension)]
                  (when-some [target' (target-fn target card-id)]
                    (assoc-in mapping [::vs/param-mapping-target ::vs/param-dimension] target')))
                mapping))
          (update-click-behavior [click-behavior]
            (or (when-some [card-id (some-> click-behavior click-behavior-card-id)]
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

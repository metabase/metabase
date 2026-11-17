(ns metabase.query-processor.middleware.visualization-settings
  (:require
   [metabase.appearance.core :as appearance]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.visualization :as lib.schema.visualization]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.util.malli :as mu]
   [metabase.util.performance :as perf]))

(defn- field-settings
  "The settings of the Field with `field-id`, normalized as column settings, or nil when it has none."
  [metadata-providerable field-id]
  (some->> (:settings (lib.metadata/field metadata-providerable field-id))
           (lib/normalize ::lib.schema.visualization/column-settings.entry)
           perf/not-empty))

(defn- update-column-settings
  "The `column-settings` of a card with the settings of each of the Fields with `field-ids` merged under the settings
  the card gives that Field, and added for the Fields the card gives none."
  [metadata-providerable field-ids column-settings]
  (let [field-id->settings (into {}
                                 (keep (fn [field-id]
                                         (when-let [settings (field-settings metadata-providerable field-id)]
                                           [field-id settings])))
                                 field-ids)
        key->field-id      (into {}
                                 (keep (fn [k]
                                         (when-let [field-id (:field-id (lib/parse-column-settings-key k))]
                                           [k field-id])))
                                 (keys column-settings))
        merged             (reduce-kv (fn [acc k settings]
                                        (assoc acc k (merge (field-id->settings (key->field-id k)) settings)))
                                      {}
                                      column-settings)
        card-field-ids     (set (vals key->field-id))]
    (into merged
          (keep (fn [[field-id settings]]
                  (when-not (card-field-ids field-id)
                    [(lib/field-id->column-settings-key field-id) settings])))
          field-id->settings)))

(defn- viz-settings
  "The viz settings of the query, given in it for an ad-hoc query or those of its card for a saved one."
  [query]
  (or (perf/not-empty (:viz-settings query))
      (when-let [card-id (-> query :info :card-id)]
        (:visualization-settings (lib.metadata/card query card-id)))))

(mu/defn update-viz-settings :- ::qp.schema/rff
  "Middleware for fetching and processing a table's visualization settings so that they can be incorporated
  into an export.

  Card-level visualization settings are either fetched from the DB (for saved cards) or passed from the frontend
  in the API call (for unsaved cards). These are merged with the base viz settings for each field that are fetched from
  the QP store (and defined in the data model settings).

  For native queries, viz settings passed from the frontend are used, without modification.

  Processed viz settings are added to the metadata under the key :viz-settings."
  [{{:keys [process-viz-settings?]} :middleware, :as query} :- ::lib.schema/query
   rff :- ::qp.schema/rff]
  (if process-viz-settings?
    (let [card-viz-settings (viz-settings query)
          fields            (or (lib/fields query -1)
                                (when (lib/previous-stage query -1)
                                  (lib/fields query -2)))
          field-ids         (filter pos-int? (map last fields))
          column-settings   (cond->> (:column_settings card-viz-settings)
                              (= (:lib/type (lib/query-stage query -1)) :mbql.stage/mbql)
                              (update-column-settings query field-ids))
          display           (-> query :middleware :display)
          viz-settings      (cond-> (assoc card-viz-settings :qp/global-column-settings (appearance/custom-formatting))
                              (seq column-settings) (assoc :column_settings column-settings)
                              display               (assoc :qp/display (keyword display)))]
      (fn update-viz-settings-rff* [metadata]
        (rff (assoc metadata :viz-settings viz-settings))))
    rff))

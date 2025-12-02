(ns metabase.query-processor.middleware.visualization-settings
  (:require
   [metabase.appearance.core :as appearance]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.models.visualization-settings :as mb.viz]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.util.malli :as mu]
   [metabase.util.performance :as perf]))

(defn- normalize-field-settings
  [id settings]
  (let [db-form   {(mb.viz/norm->db-column-ref {::mb.viz/field-id id}) settings}
        norm-form (mb.viz/db->norm-column-settings db-form)]
    (get norm-form {::mb.viz/field-id id})))

(defn- update-card-viz-settings
  "For each field, fetch its settings from the QP store, convert the settings into the normalized form
  for visualization settings, and then merge in the card-level column settings."
  [metadata-providerable column-viz-settings field-ids]
  ;; Retrieve field-level settings
  (let [field-id->settings      (reduce
                                 (fn [m field-id]
                                   (let [field-settings      (:settings (lib.metadata/field metadata-providerable field-id))
                                         norm-field-settings (normalize-field-settings field-id field-settings)]
                                     (cond-> m
                                       (seq norm-field-settings)
                                       (assoc field-id norm-field-settings))))
                                 {}
                                 field-ids)
        ;; For each column viz setting, if there is a match on the field settings, merge it in,
        ;; with the column viz settings being the default in the event of conflicts.
        merged-settings         (reduce-kv
                                 (fn [coll {field-id ::mb.viz/field-id :as k} column-viz-setting]
                                   (assoc coll k (merge (get field-id->settings field-id {}) column-viz-setting)))
                                 {}
                                 column-viz-settings)
        ;; The field-ids that are in the merged settings
        viz-field-ids           (set (map ::mb.viz/field-id (keys merged-settings)))
        ;; Keep any field settings that aren't in the merged settings and have settings
        distinct-field-settings (perf/update-keys
                                 (remove (comp viz-field-ids first) field-id->settings)
                                 (fn [k] {::mb.viz/field-id k}))]
    (merge merged-settings distinct-field-settings)))

(defn- viz-settings
  "Pull viz settings from either the query map or the DB"
  [query]
  (mb.viz/db->norm
   (or (let [viz (-> query :viz-settings)]
         (when (seq viz) viz))
       (when-let [card-id (-> query :info :card-id)]
         (:visualization-settings (lib.metadata/card query card-id))))))

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
    (let [card-viz-settings            (viz-settings query)
          normalized-card-viz-settings (mb.viz/db->norm card-viz-settings)
          column-viz-settings          (::mb.viz/column-settings card-viz-settings)
          fields                       (or (lib/fields query -1)
                                           (when (lib/previous-stage query -1)
                                             (lib/fields query -2)))
          field-ids                    (filter pos-int? (map last fields))
          updated-column-viz-settings  (if (= (:lib/type (lib/query-stage query -1)) :mbql.stage/mbql)
                                         (update-card-viz-settings query column-viz-settings field-ids)
                                         column-viz-settings)
          global-settings              (update-vals (appearance/custom-formatting)
                                                    mb.viz/db->norm-column-settings-entries)
          updated-card-viz-settings    (-> normalized-card-viz-settings
                                           (assoc ::mb.viz/column-settings updated-column-viz-settings)
                                           (assoc ::mb.viz/global-column-settings global-settings))]
      (fn update-viz-settings-rff* [metadata]
        (rff (assoc metadata :viz-settings updated-card-viz-settings))))
    rff))

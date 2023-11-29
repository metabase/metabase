(ns metabase.query-processor.middleware.visualization-settings
  (:require
   [medley.core :as m]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.public-settings :as public-settings]
   [metabase.query-processor.store :as qp.store]
   [metabase.shared.models.visualization-settings :as mb.viz]))

(defn- normalize-field-settings
  [id settings]
  (let [db-form   {(mb.viz/norm->db-column-ref {::mb.viz/field-id id}) settings}
        norm-form (mb.viz/db->norm-column-settings db-form)]
    (get norm-form {::mb.viz/field-id id})))

(defn- update-card-viz-settings
  "For each field, fetch its settings from the QP store, convert the settings into the normalized form
  for visualization settings, and then merge in the card-level column settings."
  [column-viz-settings field-ids]
  (merge column-viz-settings
         (into {} (for [field-id field-ids]
                    (let [field-settings      (:settings (lib.metadata/field (qp.store/metadata-provider) field-id))
                          norm-field-settings (normalize-field-settings field-id field-settings)
                          col-settings        (get column-viz-settings {::mb.viz/field-id field-id})]
                      [{::mb.viz/field-id field-id} (merge norm-field-settings col-settings)])))))

(defn- viz-settings
  "Pull viz settings from either the query map or the DB"
  [query]
  (or (let [viz (-> query :viz-settings)]
        (when (seq viz) viz))
      (when-let [card-id (-> query :info :card-id)]
        (mb.viz/db->norm (:visualization-settings (lib.metadata.protocols/card (qp.store/metadata-provider) card-id))))))

(defn update-viz-settings
  "Middleware for fetching and processing a table's visualization settings so that they can be incorporated
  into an export.

  Card-level visualization settings are either fetched from the DB (for saved cards) or passed from the frontend
  in the API call (for unsaved cards). These are merged with the base viz settings for each field that are fetched from
  the QP store (and defined in the data model settings).

  For native queries, viz settings passed from the frontend are used, without modification.

  Processed viz settings are added to the metadata under the key :viz-settings."
  [{{:keys [process-viz-settings?]} :middleware, :as query} rff]
  (if process-viz-settings?
    (let [card-viz-settings            (viz-settings query)
          normalized-card-viz-settings (mb.viz/db->norm card-viz-settings)
          column-viz-settings          (::mb.viz/column-settings card-viz-settings)
          fields                       (or (-> query :query :fields)
                                           (-> query :query :source-query :fields))
          field-ids                    (filter int? (map second fields))
          updated-column-viz-settings  (if (= (:type query) :query)
                                         (update-card-viz-settings column-viz-settings field-ids)
                                         column-viz-settings)
          global-settings              (m/map-vals mb.viz/db->norm-column-settings-entries
                                                   (public-settings/custom-formatting))
          updated-card-viz-settings    (-> normalized-card-viz-settings
                                           (assoc ::mb.viz/column-settings updated-column-viz-settings)
                                           (assoc ::mb.viz/global-column-settings global-settings))]
      (fn update-viz-settings-rff* [metadata]
        (rff (assoc metadata :viz-settings updated-card-viz-settings))))
    rff))

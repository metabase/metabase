(ns metabase.query-processor.middleware.visualization-settings
  (:require [metabase.models.card :refer [Card]]
            [metabase.query-processor.store :as qp.store]
            [metabase.shared.models.visualization-settings :as mb.viz]
            [toucan.db :as db]))

(defn- normalize-field-settings
  [id settings]
  (let [db-form   {(mb.viz/norm->db-column-ref {::mb.viz/field-id id}) settings}
        norm-form (mb.viz/db->norm-column-settings db-form)]
    (get norm-form {::mb.viz/field-id id})))

(defn- update-card-viz-settings
  "For each field, fetch its settings from the QP store, convert the settings into the normalized form
  for visualization settings, and then merge in the card-level column settings."
  [column-viz-settings field-ids]
  (into {} (for [field-id field-ids]
             (let [field-settings      (:settings (qp.store/field field-id))
                   norm-field-settings (normalize-field-settings field-id field-settings)
                   col-settings        (get column-viz-settings {::mb.viz/field-id field-id})]
               [{::mb.viz/field-id field-id} (merge norm-field-settings col-settings)]))))

(defn- viz-settings
  "Pull viz settings from either the query map or the DB"
  [query]
  (if-let [card-id (-> query :info :card-id)]
    ;; Saved card -> fetch viz settings from DB
    (mb.viz/db->norm (db/select-one-field :visualization_settings Card :id card-id))
    ;; Unsaved card or native query -> viz settings passed in query
    (-> query :viz-settings)))

(def ^:private non-api-export-contexts
  #{:json-download :csv-download :xlsx-download})

(defn update-viz-settings
  "Middleware for fetching and processing a table's visualization settings so that they can be incorporated
  into an export.

  Card-level visualization settings are either fetched from the DB (for saved cards) or passed from the frontend
  in the API call (for unsaved cards). These are merged with the base viz settings for each field that are fetched from
  the QP store (and defined in the data model settings).

  For native queries, viz settings passed from the frontend are used, without modification.

  Processed viz settings are added to the metadata under the key :viz-settings."
  [qp]
  (fn [query rff context]
    (if (non-api-export-contexts (-> query :info :context))
      (let [card-viz-settings           (viz-settings query)
            column-viz-settings         (::mb.viz/column-settings card-viz-settings)
            fields                      (-> query :query :fields)
            field-ids                   (filter int? (map second fields))
            updated-column-viz-settings (if (and (= (:type query) :query) (seq field-ids))
                                          (update-card-viz-settings column-viz-settings field-ids)
                                          column-viz-settings)
            updated-card-viz-settings   (assoc card-viz-settings ::mb.viz/column-settings updated-column-viz-settings)
            rff' (fn [metadata] (rff (assoc metadata :viz-settings updated-card-viz-settings)))]
        (qp query rff' context))
      (qp query rff context))))

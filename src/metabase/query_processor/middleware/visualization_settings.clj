(ns metabase.query-processor.middleware.visualization-settings
  (:require [medley.core :as m]
            [metabase.models.card :refer [Card]]
            [metabase.query-processor.store :as qp.store]
            [metabase.shared.models.visualization-settings :as mb.viz]
            [toucan.db :as db]))

(defn- normalize-field-settings
  [id settings]
  (mb.viz/db->norm-column-settings {(mb.viz/norm->db-column-ref {::mb.viz/field-id id}) settings}))

(defn- update-card-viz-settings
  "For each field, fetch its settings from the QP store, convert the settings into the normalized form
  for visualization settings, and then merge in the card-level column settings."
  [fields column-viz-settings]
  (for [[_ field-id _] fields]
    (let [field-settings            (:settings (qp.store/field field-id))
          normalized-field-settings (normalize-field-settings field-id field-settings)
          column-settings           (select-keys column-viz-settings [{::mb.viz/field-id field-id}])]
      (m/deep-merge normalized-field-settings column-settings))))

(defn- update-native-query-viz-settings
  "For each column, select its viz settings from the column-viz-settings map by its name."
  [columns column-viz-settings]
  (for [column columns]
    (select-keys column-viz-settings [{::mb.viz/column-name (:name column)}])))

(defn- viz-settings
  "Pull viz settings from either the query map or the DB"
  [query]
  (if-let [card-id (-> query :info :card-id)]
    ;; Saved card -> fetch viz settings from DB
    (mb.viz/db->norm (db/select-one-field :visualization_settings Card :id card-id))
    ;; Unsaved card -> viz settings passed in query
    (-> query :viz-settings)))

(def ^:private non-api-export-contexts
  #{:json-download :csv-download :xlsx-download})

(defn update-viz-settings
  "Middleware for fetching, processing and ordering a table's visualization settings so that they can be incorporated
  into an export.

  Card-level visualization settings are either fetched from the DB (for saved cards) or passed from the frontend
  in the API call (for unsaved cards). These are merged with the base viz settings for each field that are fetched from
  the QP store (and defined in the data model settings), and are ordered based on the field list from the query.

  For native queries, only viz settings passed from the frontend are used, and they are ordered by correlating column
  names with entries in the table.columns key.

  Processed viz settings are added to the metadata under the key :ordered-col-viz-settings."
  [qp]
  (fn [query rff context]
    (if (non-api-export-contexts (-> query :info :context))
      (let [card-viz-settings   (viz-settings query)
            column-viz-settings (::mb.viz/column-settings card-viz-settings)
            ordered-col-viz-settings (condp = (:type query)
                                       :query
                                       (update-card-viz-settings (-> query :query :fields)
                                                                 column-viz-settings)

                                       :native
                                       (update-native-query-viz-settings (-> card-viz-settings :table.columns)
                                                                         column-viz-settings))
            rff' (fn [metadata] (rff (assoc metadata :ordered-col-viz-settings ordered-col-viz-settings)))]
        (qp query rff' context))
      (qp query rff context))))

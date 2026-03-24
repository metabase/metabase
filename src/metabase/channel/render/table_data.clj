(ns metabase.channel.render.table-data
  "Shared utilities for preparing query results for table rendering.
   Used by both HTML/PNG table rendering (emails, pulses) and Slack table blocks.")

(set! *warn-on-reflection* true)

(defn show-in-table?
  "Should this column be shown in a rendered table?
   Filters out sensitive, retired, and details-only columns."
  [{:keys [visibility_type] :as _column}]
  (not (contains? #{:details-only :retired :sensitive} visibility_type)))

(defn create-remapping-lookup
  "Creates a map from column names to the index of their remapped column.
   Used to handle FK remapping where columns have :remapped_from metadata."
  [cols]
  (into {}
        (for [[col-idx {:keys [remapped_from]}] (map-indexed vector cols)
              :when remapped_from]
          [remapped_from col-idx])))

(defn prepare-table-data
  "Prepare query results for table rendering.
   - Filters out columns that shouldn't be shown (sensitive, retired, details-only)
   - Handles FK remapping: removes duplicate columns and substitutes values

   Returns {:cols [...] :rows [...]} with the prepared data."
  [cols rows]
  (let [remapping-lookup (create-remapping-lookup cols)
        ;; Build list of columns to keep (visible and not remapped_from)
        ;; and track which source index to read from for each
        col-info         (into []
                               (comp
                                (map-indexed vector)
                                (filter (fn [[_ col]] (show-in-table? col)))
                                (remove (fn [[_ col]] (:remapped_from col)))
                                (map (fn [[idx col]]
                                       {:source-idx (or (get remapping-lookup (:name col)) idx)
                                        :col        (if-let [remapped-idx (get remapping-lookup (:name col))]
                                                      (nth cols remapped-idx)
                                                      col)})))
                               cols)
        output-cols      (mapv :col col-info)
        col-indices      (mapv :source-idx col-info)
        output-rows      (mapv (fn [row]
                                 (mapv #(nth row % nil) col-indices))
                               rows)]
    {:cols output-cols
     :rows output-rows}))

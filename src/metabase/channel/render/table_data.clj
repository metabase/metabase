(ns metabase.channel.render.table-data
  "Shared utilities for preparing query results for table rendering.
   Used by both HTML/PNG table rendering (emails, pulses) and Slack table blocks.")

(set! *warn-on-reflection* true)

(defn show-in-table?
  "Should this column be shown in a rendered table?
   Filters out sensitive, retired, and details-only columns."
  [{:keys [visibility_type] :as _column}]
  (not (contains? #{:details-only :retired :sensitive} visibility_type)))

(defn show-in-object-detail?
  "Should this column be shown in an object-detail (key/value) view?
   Like [[show-in-table?]] but keeps `:details-only` columns (the point of object detail);
   drops only sensitive and retired."
  [{:keys [visibility_type] :as _column}]
  (not (contains? #{:retired :sensitive} visibility_type)))

(defn create-remapping-lookup
  "Creates a map from column names to the index of their remapped column.
   Used to handle FK remapping where columns have :remapped_from metadata."
  [cols]
  (into {}
        (for [[col-idx {:keys [remapped_from]}] (map-indexed vector cols)
              :when remapped_from]
          [remapped_from col-idx])))

(defn visible-columns
  "The columns a rendered table shows, in result order: hidden columns dropped, and remap
  targets dropped because their source column already occupies a slot.

  Mirrors the frontend's `extractRemappedColumns`
  (`frontend/src/metabase/viz-core/lib/remapping.ts`): the source column keeps its own identity
  and carries the target it was remapped to as `:remapped_to_column`. Everything keyed by column
  name -- per-column styles, colour lookups, the `column_title` setting -- therefore resolves
  against the column the user configured, while the name to show and the type to align by are
  still reachable through the attached target.

  Each column also carries `:source-idx`, the position in an unfiltered result row that its value
  comes from: the target's for a remapped column, its own otherwise. Same idea as the `:source-idx`
  [[prepare-table-data]] computes.

  A column whose remap target is missing keeps its own identity rather than throwing, as the
  frontend does."
  [cols]
  (let [remapping-lookup (create-remapping-lookup cols)]
    (into []
          (comp (map-indexed vector)
                (filter (fn [[_idx col]] (show-in-table? col)))
                (remove (fn [[_idx col]] (:remapped_from col)))
                (map (fn [[idx col]]
                       (if-let [target-idx (get remapping-lookup (:name col))]
                         (assoc col
                                :remapped_to_column (nth cols target-idx)
                                :source-idx         target-idx)
                         (assoc col :source-idx idx)))))
          cols)))

(defn remapped-display-name
  "The name to show for a column: the remap target's name, else the column's own. Mirrors the
  frontend's `displayNameForColumn` (`frontend/src/metabase/value-formatting/column.ts`).

  The same rule is translated for the pivot path in `metabase.pivot.core/display-name-for-col`.
  That one cannot be reused here, because it also gates the remap on `format-values?`, which the
  frontend rule does not."
  [col]
  (or (:display_name (:remapped_to_column col))
      (:display_name col)))

(defn prepare-table-data
  "Prepare query results for table rendering.
   - Filters out columns the `visible?` predicate rejects (defaults to [[show-in-table?]])
   - Handles FK remapping: removes duplicate columns and substitutes values

   Returns {:cols [...] :rows [...]} with the prepared data."
  ([cols rows]
   (prepare-table-data cols rows show-in-table?))
  ([cols rows visible?]
   (let [remapping-lookup (create-remapping-lookup cols)
         ;; Build list of columns to keep (visible and not remapped_from)
         ;; and track which source index to read from for each
         col-info         (into []
                                (comp
                                 (map-indexed vector)
                                 (filter (fn [[_ col]] (visible? col)))
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
      :rows output-rows})))

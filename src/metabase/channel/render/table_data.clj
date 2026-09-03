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
  "The columns a rendered table actually shows, in result order:

   - columns the `visible?` predicate rejects are dropped (defaults to [[show-in-table?]])
   - a column with `:remapped_to` is replaced by the column it points at, so an FK renders its
     human-readable value rather than the raw id
   - the remap target itself is then dropped, since it has already been emitted in the source
     column's slot

  Every list that is later indexed against a rendered row must be derived from this, or the
  two fall out of alignment -- see `metabase.channel.render.table/render-table-head`, which
  zips the header titles against the header row positionally (#71069)."
  ([cols] (visible-columns cols show-in-table?))
  ([cols visible?]
   (let [remapping-lookup (create-remapping-lookup cols)]
     (into []
           (comp (filter visible?)
                 (remove :remapped_from)
                 (map (fn [col]
                        (if (:remapped_to col)
                          (nth cols (get remapping-lookup (:name col)))
                          col))))
           cols))))

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

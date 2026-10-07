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
  "The columns a rendered table shows, in result order. Drops columns `visible?` rejects (default [[show-in-table?]])
  and columns with `:remapped_from`. Each column gets `:source-idx`, the index of its value in a result row. A
  remapped column also gets its target as `:remapped_to_column`, and its `:source-idx` points at the target's value."
  ([cols]
   (visible-columns cols show-in-table?))
  ([cols visible?]
   (let [remapping-lookup (create-remapping-lookup cols)]
     (into []
           (comp (map-indexed vector)
                 (filter (fn [[_idx col]] (visible? col)))
                 (remove (fn [[_idx col]] (:remapped_from col)))
                 (map (fn [[idx col]]
                        (if-let [target-idx (get remapping-lookup (:name col))]
                          (assoc col
                                 :remapped_to_column (nth cols target-idx)
                                 :source-idx         target-idx)
                          (assoc col :source-idx idx)))))
           cols))))

(defn remapped-display-name
  "The `:display_name` of the column's `:remapped_to_column` if it has one, else its own."
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
   (let [visible-cols (visible-columns cols visible?)]
     {:cols (mapv #(or (:remapped_to_column %) (dissoc % :source-idx)) visible-cols)
      :rows (mapv (fn [row] (mapv #(nth row (:source-idx %) nil) visible-cols)) rows)})))

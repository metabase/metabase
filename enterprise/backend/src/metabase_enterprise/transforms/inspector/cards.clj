(ns metabase-enterprise.transforms.inspector.cards
  "Card generation utilities for Transform Inspector.

   Cards are visualization units with:
   - Query (dataset_query ready to execute)
   - Display type and viz settings
   - Metadata for grouping and layout
   - Interestingness score

   This module generates card definitions that the frontend executes."
  (:require
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.transforms.inspector.interestingness :as interestingness]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Display Type Selection --------------------------------------------------

(defn- viz-type-for-field
  "Determine appropriate visualization type for a field."
  [field]
  (let [base-type     (:base-type field)
        semantic-type (:semantic-type field)
        distinct-count (get-in field [:stats :distinct-count])]
    (cond
      ;; Temporal fields -> line chart
      (contains? #{:type/DateTime :type/Date :type/Time
                   :type/DateTimeWithTZ :type/DateTimeWithLocalTZ}
                 base-type)
      :line

      ;; Boolean -> pie chart
      (= base-type :type/Boolean)
      :pie

      ;; Very low cardinality -> pie chart
      (and distinct-count (<= distinct-count 5))
      :pie

      ;; Low cardinality -> row chart (horizontal bars)
      (and distinct-count (<= distinct-count 20))
      :row

      ;; Default -> bar chart
      :else
      :bar)))

;;; -------------------------------------------------- Query Building --------------------------------------------------

(defn- make-distribution-query
  "Generate a pMBQL query for field distribution (histogram/breakdown)."
  [db-id table-id field-id]
  (let [mp (lib-be/application-database-metadata-provider db-id)
        table-metadata (lib.metadata/table mp table-id)
        field-metadata (lib.metadata/field mp field-id)]
    (-> (lib/query mp table-metadata)
        (lib/aggregate (lib/count))
        (lib/breakout (lib/ref field-metadata)))))

(defn- make-count-query
  "Generate a pMBQL query for row count."
  [db-id table-id]
  (let [mp (lib-be/application-database-metadata-provider db-id)
        table-metadata (lib.metadata/table mp table-id)]
    (-> (lib/query mp table-metadata)
        (lib/aggregate (lib/count)))))

(defn- make-null-count-query
  "Generate a pMBQL query for counting nulls in a field.
   Returns total count and null count in one query."
  [db-id table-id field-id]
  (let [mp (lib-be/application-database-metadata-provider db-id)
        table-metadata (lib.metadata/table mp table-id)
        field-metadata (lib.metadata/field mp field-id)]
    ;; COUNT(*) - COUNT(field) = null count
    ;; We return both so FE can compute null rate
    (-> (lib/query mp table-metadata)
        (lib/aggregate (lib/count))
        (lib/aggregate (lib/count (lib/ref field-metadata))))))

(defn- make-distinct-count-query
  "Generate a pMBQL query for counting distinct values in a field.
   Returns [distinct-count, total-count] so FE can check if all values are same."
  [db-id table-id field-id]
  (let [mp (lib-be/application-database-metadata-provider db-id)
        table-metadata (lib.metadata/table mp table-id)
        field-metadata (lib.metadata/field mp field-id)]
    (-> (lib/query mp table-metadata)
        (lib/aggregate (lib/distinct (lib/ref field-metadata)))
        (lib/aggregate (lib/count)))))

;;; -------------------------------------------------- Card Generators --------------------------------------------------

(defn- stats-card-id
  "Generate the stats card ID for a given card ID."
  [card-id]
  (str card-id "-stats"))

(defn distribution-stats-card
  "Generate a hidden stats card for a distribution card.
   Computes [distinct-count, total-count] so FE can check for degeneracy.

   FE interprets:
   - distinct-count = 1 → all same value (degenerate for bar/line charts)
   - distinct-count / total-count > 0.9 → high cardinality"
  [db-id table-id table-name field for-card-id]
  (let [field-id (:id field)
        field-name (:name field)]
    {:id            (stats-card-id for-card-id)
     :section-id    nil  ; Hidden cards don't belong to a section
     :title         (str field-name " stats")
     :display       :hidden
     :dataset-query (make-distinct-count-query db-id table-id field-id)
     :for-card-id   for-card-id  ; Links back to the main card
     :summary       true
     :interestingness 0.0}))

(defn distribution-card
  "Generate a distribution card for a field.
   Returns nil if the field doesn't have an ID (can't generate query).

   Options:
   - :section-id - section to place the card in
   - :group-id - comparison group ID (for comparison layout)
   - :group-role - :input or :output
   - :group-order - order within group
   - :summary - true if FE should send summary back
   - :with-stats - true to also generate a companion stats card (default true)"
  [db-id table-id table-name field & {:keys [section-id group-id group-role group-order summary with-stats]
                                       :or {section-id "distributions"
                                            summary false
                                            with-stats true}}]
  (when-let [field-id (:id field)]
    (let [field-name (:name field)
          interestingness-result (interestingness/score-field field)
          display (viz-type-for-field field)
          card-id (str table-name "-" field-name "-distribution")
          main-card (cond-> {:id             card-id
                             :section-id     section-id
                             :title          (str field-name " (" table-name ")")
                             :display        display
                             :dataset-query  (make-distribution-query db-id table-id field-id)
                             :interestingness (:score interestingness-result)
                             :summary        summary
                             :stats-card-id  (when with-stats (stats-card-id card-id))}
                      group-id    (assoc :group-id group-id)
                      group-role  (assoc :group-role group-role)
                      group-order (assoc :group-order group-order))]
      (if with-stats
        ;; Return both main card and stats card
        [main-card (distribution-stats-card db-id table-id table-name field card-id)]
        ;; Return just the main card
        [main-card]))))

(defn row-count-card
  "Generate a hidden card for computing row count.
   Used for summary statistics - not rendered in UI."
  [db-id table-id table-name section-id]
  {:id            (str table-name "-row-count")
   :section-id    section-id
   :title         (str table-name " Row Count")
   :display       :hidden
   :dataset-query (make-count-query db-id table-id)
   :summary       true  ; Always collect summary for stat cards
   :interestingness 1.0})

(defn scalar-card
  "Generate a scalar card for a single computed value."
  [id title query section-id & {:keys [summary] :or {summary false}}]
  {:id            id
   :section-id    section-id
   :title         title
   :display       :scalar
   :dataset-query query
   :summary       summary
   :interestingness 1.0})

(defn gauge-card
  "Generate a gauge card for a percentage/ratio value."
  [id title query section-id & {:keys [summary] :or {summary false}}]
  {:id            id
   :section-id    section-id
   :title         title
   :display       :gauge
   :dataset-query query
   :summary       summary
   :interestingness 0.9})

(defn table-card
  "Generate a table card for tabular data."
  [id title query section-id & {:keys [summary] :or {summary false}}]
  {:id            id
   :section-id    section-id
   :title         title
   :display       :table
   :dataset-query query
   :summary       summary
   :interestingness 0.7})

;;; -------------------------------------------------- Comparison Card Generators --------------------------------------------------

(defn comparison-distribution-cards
  "Generate distribution cards for column comparison.
   Sets up grouping metadata for comparison layout.
   Returns a vector of [main-card, stats-card] or nil if field has no ID."
  [db-id table-id table-name field column-name role order]
  (distribution-card db-id table-id table-name field
                     :section-id "column-comparisons"
                     :group-id column-name
                     :group-role role
                     :group-order order
                     :summary true))

(defn make-column-comparison-cards
  "Generate comparison cards for matched columns.
   Returns a seq of cards for all input/output comparisons.

   source-table-id is the main FROM table - its cards are sorted first among inputs."
  [column-matches sources target source-table-id]
  (let [db-id (:db-id (first sources))]
    (->> column-matches
         (mapcat
          (fn [{:keys [output-column output-field input-columns]}]
            (let [;; Sort inputs so source table comes first
                  sorted-inputs (sort-by #(if (= (:table-id %) source-table-id) 0 1) input-columns)]
              (concat
               ;; Input cards (each returns [main, stats] or nil)
               (keep
                (fn [[idx {:keys [table-id table-name field]}]]
                  (comparison-distribution-cards db-id table-id table-name field
                                                 output-column :input idx))
                (map-indexed vector sorted-inputs))
               ;; Output card
               (when (:id output-field)
                 (comparison-distribution-cards db-id (:table-id target) (:table-name target)
                                                output-field output-column :output 0))))))
         (apply concat)
         vec)))

;;; -------------------------------------------------- Join Analysis Cards --------------------------------------------------

(defn make-join-stat-cards
  "Generate cards for join statistics.
   Creates hidden cards that compute join-related stats."
  [ctx]
  (let [{:keys [db-id join-structure sources]} ctx]
    ;; For each join, create cards to compute stats
    ;; These are hidden cards that FE executes to get stats
    (mapcat
     (fn [{:keys [alias source-table]}]
       (when source-table
         (let [table (some #(when (= (:table-id %) source-table) %) sources)
               table-name (or (:table-name table) (str "table-" source-table))]
           ;; Row count for joined table
           [(row-count-card db-id source-table table-name "join-stats")])))
     join-structure)))

;;; -------------------------------------------------- Interesting Fields Selection --------------------------------------------------

(defn interesting-distribution-cards
  "Generate distribution cards for the most interesting fields.
   Returns all cards flattened (main cards + stats cards).

   Options:
   - :threshold - minimum interestingness score (default 0.3)
   - :limit - max number of cards (default 10)
   - :section-id - section for cards"
  [db-id table-id table-name fields & {:keys [threshold limit section-id]
                                        :or {threshold 0.3 limit 10 section-id "distributions"}}]
  (let [interesting (interestingness/interesting-fields fields :threshold threshold :limit limit)]
    (->> interesting
         (keep (fn [field]
                 (distribution-card db-id table-id table-name field
                                    :section-id section-id
                                    :summary true)))
         (apply concat)
         vec)))

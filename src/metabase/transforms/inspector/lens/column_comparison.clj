(ns metabase.transforms.inspector.lens.column-comparison
  "Column Comparison lens - compare distributions for matched columns.

   This lens is applicable when there are matched columns between
   input and output tables. It shows distribution comparisons grouped
   by output column.

   Layout: :comparison"
  (:require
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.transforms.inspector.lens.core :as lens.core]))

(set! *warn-on-reflection* true)

(lens.core/register-lens! :column-comparison 20)

;;; -------------------------------------------------- Query Building --------------------------------------------------

(defn- make-distribution-query
  "Generate a pMBQL query for field distribution."
  [db-id table-id field-id]
  (let [mp (lib-be/application-database-metadata-provider db-id)
        table-metadata (lib.metadata/table mp table-id)
        field-metadata (lib.metadata/field mp field-id)]
    (-> (lib/query mp table-metadata)
        (lib/aggregate (lib/count))
        (lib/breakout (lib/ref field-metadata)))))

;;; -------------------------------------------------- Display Type Selection --------------------------------------------------

(defn- viz-type-for-field
  "Determine appropriate visualization type for a field."
  [field]
  (let [base-type (:base_type field)
        distinct-count (get-in field [:stats :distinct_count])]
    (cond
      (contains? #{:type/DateTime :type/Date :type/Time
                   :type/DateTimeWithTZ :type/DateTimeWithLocalTZ}
                 base-type)
      :line

      (= base-type :type/Boolean)
      :pie

      (and distinct-count (<= distinct-count 5))
      :pie

      (and distinct-count (<= distinct-count 20))
      :row

      :else
      :bar)))

;;; -------------------------------------------------- Card Generation --------------------------------------------------

(defn- distribution-card
  "Generate a distribution card for a field."
  [db-id table-id table-name field output-column role order params]
  {:id            (lens.core/make-card-id (str table-name "-" (:name field) "-distribution") params)
   :section_id    "comparisons"
   :title         (str (:name field) " (" table-name ")")
   :display       (viz-type-for-field field)
   :dataset_query (make-distribution-query db-id table-id (:id field))
   :metadata      {:group_id    output-column
                   :group_role  role
                   :group_order order
                   :table_id    table-id
                   :field_id    (:id field)}})

(defn- comparison-cards-for-match
  "Generate comparison cards for a single column match."
  [{:keys [output-column output-field input-columns]} target params]
  (let [;; Filter out input-columns with nil source-table-id (e.g., computed columns)
        valid-inputs (filter :source-table-id input-columns)]
    (when (seq valid-inputs)
      (concat
       ;; Input cards
       (map-indexed (fn [i {:keys [source-table-id source-table-name id]}]
                      (distribution-card (:db_id target)
                                         source-table-id source-table-name
                                         {:id id :name (:name (first valid-inputs))
                                          :base_type (:base_type output-field)
                                          :stats (:stats output-field)}
                                         output-column :input i params))
                    valid-inputs)
       ;; Output card
       [(distribution-card (:db_id target) (:table_id target) (:table_name target)
                           output-field output-column :output 0 params)]))))

;;; -------------------------------------------------- Lens Implementation --------------------------------------------------

(defmethod lens.core/lens-applicable? :column-comparison
  [_ ctx]
  (:has-column-matches? ctx))

(defmethod lens.core/lens-metadata :column-comparison
  [_ _ctx]
  {:id           "column-comparison"
   :display_name "Column Distributions"
   :description  "Compare input/output column distributions"
   :complexity   {:level :slow}})

(defmethod lens.core/make-lens :column-comparison
  [_ ctx params]
  (let [{:keys [column-matches target]} ctx
        match-count (count column-matches)]
    {:id           "column-comparison"
     :display_name "Column Distributions"
     :complexity   {:level :slow}
     :summary      {:text       "Compare value distributions for columns that match between input and output"
                    :highlights [{:label "Matched Columns" :value match-count}]}
     :sections     [{:id     "comparisons"
                     :title  "Column Comparisons"
                     :layout :comparison}]
     :cards        (vec (mapcat #(comparison-cards-for-match % target params) column-matches))}))

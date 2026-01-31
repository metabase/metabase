(ns metabase-enterprise.transforms.inspector-v2.lens.column-comparison
  "Column Comparison lens - compare distributions for matched columns.

   This lens is applicable when there are matched columns between
   input and output tables. It shows distribution comparisons grouped
   by output column.

   Layout: :comparison"
  (:require
   [metabase-enterprise.transforms.inspector-v2.lens.core :as lens.core]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]))

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
  (let [base-type (:base-type field)
        distinct-count (get-in field [:stats :distinct-count])]
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
  [db-id table-id table-name field output-column role order]
  {:id            (str table-name "-" (:name field) "-distribution")
   :section-id    "comparisons"
   :title         (str (:name field) " (" table-name ")")
   :display       (viz-type-for-field field)
   :dataset-query (make-distribution-query db-id table-id (:id field))
   :metadata      {:group-id    output-column
                   :group-role  role
                   :group-order order
                   :table-id    table-id
                   :field-id    (:id field)}})

(defn- comparison-cards-for-match
  "Generate comparison cards for a single column match."
  [{:keys [output-column output-field input-columns]} target]
  (concat
   ;; Input cards
   (map-indexed (fn [i {:keys [source-table-id source-table-name id]}]
                  (distribution-card (or (:db-id target) (:db-id (first input-columns)))
                                     source-table-id source-table-name
                                     {:id id :name (:name (first input-columns))
                                      :base-type (:base-type output-field)
                                      :stats (:stats output-field)}
                                     output-column :input i))
                input-columns)
   ;; Output card
   [(distribution-card (:db-id target) (:table-id target) (:table-name target)
                       output-field output-column :output 0)]))

;;; -------------------------------------------------- Lens Implementation --------------------------------------------------

(defmethod lens.core/lens-applicable? :column-comparison
  [_ ctx]
  (:has-column-matches? ctx))

(defmethod lens.core/lens-metadata :column-comparison
  [_ _ctx]
  {:id           "column-comparison"
   :display-name "Column Distributions"
   :description  "Compare input/output column distributions"})

(defmethod lens.core/make-lens :column-comparison
  [_ ctx]
  (let [{:keys [column-matches target]} ctx
        match-count (count column-matches)]
    {:id           "column-comparison"
     :display-name "Column Distributions"
     :summary      {:text       (str match-count " matched column(s)")
                    :highlights [{:label "Matched Columns" :value match-count}]}
     :sections     [{:id     "comparisons"
                     :title  "Column Comparisons"
                     :layout :comparison}]
     :cards        (vec (mapcat #(comparison-cards-for-match % target) column-matches))}))

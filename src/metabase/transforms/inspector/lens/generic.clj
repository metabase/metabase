(ns metabase.transforms.inspector.lens.generic
  "Generic Summary lens - basic overview for any transform.

   This lens is always applicable and provides:
   - Row count comparison (inputs vs output)

   Layout: :comparison"
  (:require
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.transforms.inspector.lens.core :as lens.core]))

(set! *warn-on-reflection* true)

(lens.core/register-lens! :generic-summary 0)

;;; -------------------------------------------------- Query Building --------------------------------------------------

(defn- make-count-query
  "Generate a pMBQL COUNT(*) query."
  [db-id table-id]
  (let [mp (lib-be/application-database-metadata-provider db-id)
        table-metadata (lib.metadata/table mp table-id)]
    (-> (lib/query mp table-metadata)
        (lib/aggregate (lib/count)))))

;;; -------------------------------------------------- Card Generation --------------------------------------------------

(defn- row-count-card
  "Generate a row count card."
  [db-id table-id table-name role order]
  {:id            (str table-name "-row-count")
   :section_id    "row-counts"
   :title         (str table-name " Row Count")
   :display       :scalar
   :dataset_query (make-count-query db-id table-id)
   :metadata      {:dedup_key   [:table_count table-id]
                   :group_id    "row-count"
                   :group_role  role
                   :group_order order
                   :table_id    table-id}})

;;; -------------------------------------------------- Lens Implementation --------------------------------------------------

(defmethod lens.core/lens-applicable? :generic-summary
  [_ _ctx]
  true)

(defmethod lens.core/lens-metadata :generic-summary
  [_ _ctx]
  {:id           "generic-summary"
   :display_name "Data Summary"
   :description  "Overview of input and output tables"})

(defmethod lens.core/make-lens :generic-summary
  [_ ctx _params]
  (let [{:keys [sources target]} ctx]
    {:id           "generic-summary"
     :display_name "Data Summary"
     :summary      {:text       "Compare row counts before and after transformation"
                    :highlights (cond-> [{:label "Input Tables" :value (count sources)}]
                                  target
                                  (conj {:label "Output Columns" :value (:column_count target)}))}
     :sections     [{:id     "row-counts"
                     :title  "Row Counts"
                     :layout :comparison}]
     :cards        (vec
                    (concat
                     ;; Input row counts
                     (map-indexed (fn [i {:keys [table_id table_name db_id]}]
                                    (row-count-card db_id table_id table_name :input i))
                                  sources)
                     ;; Output row count
                     (when target
                       [(row-count-card (:db_id target) (:table_id target)
                                        (:table_name target) :output 0)])))}))

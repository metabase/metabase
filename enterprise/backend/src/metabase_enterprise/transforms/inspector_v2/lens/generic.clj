(ns metabase-enterprise.transforms.inspector-v2.lens.generic
  "Generic Summary lens - basic overview for any transform.

   This lens is always applicable and provides:
   - Row count comparison (inputs vs output)

   Layout: :comparison"
  (:require
   [metabase-enterprise.transforms.inspector-v2.lens.core :as lens.core]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]))

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
   :section-id    "row-counts"
   :title         (str table-name " Row Count")
   :display       :scalar
   :dataset-query (make-count-query db-id table-id)
   :metadata      {:dedup-key   [:table-count table-id]
                   :group-id    "row-count"
                   :group-role  role
                   :group-order order
                   :table-id    table-id}})

;;; -------------------------------------------------- Lens Implementation --------------------------------------------------

(defmethod lens.core/lens-applicable? :generic-summary
  [_ _ctx]
  true)

(defmethod lens.core/lens-metadata :generic-summary
  [_ _ctx]
  {:id           "generic-summary"
   :display-name "Data Summary"
   :description  "Overview of input and output tables"})

(defmethod lens.core/make-lens :generic-summary
  [_ ctx _params]
  (let [{:keys [sources target]} ctx]
    {:id           "generic-summary"
     :display-name "Data Summary"
     :summary      {:text       (str "Transform with " (count sources) " input table(s)")
                    :highlights (cond-> [{:label "Input Tables" :value (count sources)}]
                                  target
                                  (conj {:label "Output Columns" :value (:column-count target)}))}
     :sections     [{:id     "row-counts"
                     :title  "Row Counts"
                     :layout :comparison}]
     :cards        (vec
                    (concat
                     ;; Input row counts
                     (map-indexed (fn [i {:keys [table-id table-name db-id]}]
                                    (row-count-card db-id table-id table-name :input i))
                                  sources)
                     ;; Output row count
                     (when target
                       [(row-count-card (:db-id target) (:table-id target)
                                        (:table-name target) :output 0)])))}))

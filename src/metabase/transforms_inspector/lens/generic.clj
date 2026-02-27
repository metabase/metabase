(ns metabase.transforms-inspector.lens.generic
  "Generic Summary lens - basic overview for any transform.

   This lens is always applicable and provides:
   - Row count comparison (inputs vs output)

   Layout: :comparison"
  (:require
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.transforms-inspector.lens.core :as lens.core]
   [metabase.util.i18n :refer [tru]]))

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
  [db-id table-id table-name role order params]
  {:id            (lens.core/make-card-id (str table-name "-row-count") params)
   :section_id    "row-counts"
   :title         (tru "{0} Row Count" table-name)
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
   :display_name (tru "Data Summary")
   :description  (tru "Overview of input and output tables")
   :complexity   {:level :fast}})

(defmethod lens.core/make-lens :generic-summary
  [lens-type ctx params]
  (let [{:keys [sources target]} ctx]
    (lens.core/with-metadata lens-type ctx
      {:summary  {:text       (tru "Compare row counts before and after transformation")
                  :highlights (cond-> [{:label (tru "Input Tables") :value (count sources)}]
                                target
                                (conj {:label (tru "Output Columns") :value (:column_count target)}))}
       :sections [{:id     "row-counts"
                   :title  (tru "Row Counts")
                   :layout :comparison}]
       :cards    (vec
                  (concat
                   ;; Input row counts
                   (map-indexed (fn [i {:keys [table_id table_name db_id]}]
                                  (row-count-card db_id table_id table_name :input i params))
                                sources)
                   ;; Output row count
                   (when target
                     [(row-count-card (:db_id target) (:table_id target)
                                      (:table_name target) :output 0 params)])))})))

(ns metabase-enterprise.transforms.inspector-v2.lens.unmatched-rows
  "Unmatched Rows lens - analyze rows that failed to join.

   This is a drill-down lens triggered from join-analysis when
   null counts are significant. It shows sample unmatched rows
   to help diagnose join issues.

   Trigger: join-step card shows > 5% null rate
   Alert: shown when > 20% null rate

   Layout: :flat"
  (:require
   [clojure.string :as str]
   [metabase-enterprise.transforms.inspector-v2.lens.core :as lens.core]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]))

(set! *warn-on-reflection* true)

(lens.core/register-lens! :unmatched-rows 100)

;;; -------------------------------------------------- Query Building --------------------------------------------------

(defn- make-null-sample-query
  "Query for sample rows where the join key is null."
  [db-id table-id field-id limit]
  (let [mp (lib-be/application-database-metadata-provider db-id)
        table-metadata (lib.metadata/table mp table-id)
        field-metadata (lib.metadata/field mp field-id)]
    (-> (lib/query mp table-metadata)
        (lib/filter (lib/is-null (lib/ref field-metadata)))
        (lib/limit limit))))

;;; -------------------------------------------------- Card Generation --------------------------------------------------

(defn- sample-card
  [db-id table-id table-name field-id field-name join-step]
  {:id         (str "unmatched-sample-" join-step)
   :section-id "samples"
   :title      (str "Unmatched rows: " table-name "." field-name)
   :display    :table
   :dataset-query (make-null-sample-query db-id table-id field-id 100)
   :metadata   {:card-type  :unmatched-sample
                :join-step  join-step
                :table-id   table-id
                :field-id   field-id}})

(defn- all-cards
  [ctx]
  (let [{:keys [join-structure sources db-id]} ctx]
    (for [[idx join] (map-indexed vector join-structure)
          :let [step (inc idx)
                table-id (:source-table join)
                table (some #(when (= (:table-id %) table-id) %) sources)
                ;; Use first field as proxy for join key
                field (first (:fields table))]
          :when (and table field)]
      (sample-card (or (:db-id table) db-id)
                   table-id
                   (:table-name table)
                   (:id field)
                   (:name field)
                   step))))

;;; -------------------------------------------------- Lens Implementation --------------------------------------------------

(defmethod lens.core/lens-applicable? :unmatched-rows
  [_ ctx]
  ;; Only applicable when we have joins
  (:has-joins? ctx))

(defmethod lens.core/lens-metadata :unmatched-rows
  [_ _ctx]
  {:id           "unmatched-rows"
   :display-name "Unmatched Rows"
   :description  "Sample rows that failed to join"})

(defmethod lens.core/make-lens :unmatched-rows
  [_ ctx]
  (let [{:keys [join-structure]} ctx
        join-count (count join-structure)]
    {:id           "unmatched-rows"
     :display-name "Unmatched Rows"
     :summary      {:text       (str "Sample unmatched rows for " join-count " join(s)")
                    :highlights [{:label "Joins" :value join-count}]}
     :sections     [{:id     "samples"
                     :title  "Unmatched Row Samples"
                     :layout :flat}]
     :cards        (vec (all-cards ctx))}))

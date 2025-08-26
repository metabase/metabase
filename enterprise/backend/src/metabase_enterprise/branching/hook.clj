(ns metabase-enterprise.branching.hook
  "Defines a toucan pipeline step hook that substitutes out tables that can be branched
  with CTEs that reflect their current state when branched."
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase.app-db.core :as mdb]
   [metabase.branching.core :as branching]
   [metabase.models.resolution :as models.resolution]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.pipeline :as pipeline]))

(def branchables
  (delay
    (reduce-kv (fn [acc k _]
                 (cond-> acc
                   (isa? k :hook/branchable) (assoc (t2/table-name k) (map :column_name
                                                                           (t2/query {:select [:column_name]
                                                                                      :from [[:information_schema.columns]]
                                                                                      :where [:and [:= :table_name (case (mdb/db-type)
                                                                                                                     :h2 (u/upper-case-en (name (t2/table-name k)))
                                                                                                                     (name (t2/table-name k)))]]})))))
               {}
               models.resolution/model->namespace)))

(defn- branched-cte
  [table]
  (let [current-branch-id (:id @branching/*current-branch*)]
    {:select (into [[[:coalesce :bm.original_id :branched.id] :id]]
                   (for [col-name (table @branchables)
                         :when (not (contains? #{"id" "ID"} col-name))]
                     (keyword (str "branched." col-name))))
     :from [[table :branched]]
     :left-join [[:branch_model_mapping :bm]
                 [:and
                  [:= :bm.branched_model_id :branched.id]
                  [:= :bm.model_type [:inline (name table)]]]]
     :where [:or
             [:and [:is-not :bm.branched_model_id nil]
              [:= :bm.branch_id current-branch-id]]
             [:and
              [:is :bm.branched_model_id nil]
              [:not-exists
               {:select [1]
                :from [[:branch_model_mapping :bm2]]
                :where [:and
                        [:= :bm2.branch_id current-branch-id]
                        [:= :bm2.original_id :branched.id]
                        [:= :bm2.model_type [:inline (name table)]]]}]]]}))

(methodical/defmethod pipeline/build [#_query-type     :default
                                      #_model          :default
                                      #_resolved-query :default]
  [query-type model parsed-args resolved-query]
  (let [built (next-method query-type model parsed-args resolved-query)
        with (some->> built :with (m/index-by first))]
    (if (and branching/*enable-branch-hook*
             (map? built)
             (not= model :model/Branch)
             (or (contains? built :select) (contains? built :union) (contains? built :union-all))
             (not= (:from built) [[:information_schema.columns]]))
      (if (and (map? with) (contains? with :branched_cte))
        built
        (update (walk/postwalk #(cond
                                  (= :report_card %)
                                  :branched_cte

                                  (and (keyword? %) (str/starts-with? (name %) "report_card."))
                                  (keyword (str/replace-first (name %) "report_card." "branched_cte."))

                                  (and (keyword? %) (= (namespace %) "report_card"))
                                  (keyword "branched_cte" (name %))

                                  :else %)
                               built)
                :with conj [:branched_cte (branched-cte :report_card)]))
      built)))

(ns metabase-enterprise.branching.models.hook
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
   [toucan2.pipeline :as t2.pipeline]))

(def ^:private branchables
  "Map of tables derving from :hook/branchable -> their columns."
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

(defn- substitute-ctes
  "Substitute out branchable tables in a query with their replacements."
  [query tables]
  (let [with (some->> query :with (m/index-by first))
        tables* (remove #(contains? with (keyword (str "branched_" (name %)))) tables)
        tables->cte-refs (zipmap tables* (map #(keyword (str "branched_" (name %))) tables*))
        str-tables->cte-refs (reduce-kv #(assoc %1 (name %2) (name %3)) {} tables->cte-refs)
        replaced (atom #{})]
    (letfn [(walker [node]
              (cond
                (not (keyword? node)) node
                (contains? tables->cte-refs node)
                (do (swap! replaced conj node)
                    (node tables->cte-refs))

                (contains? str-tables->cte-refs (namespace node))
                (keyword (get str-tables->cte-refs (namespace node)) (name node))

                (some #(str/starts-with? (name node) (str % ".")) (keys str-tables->cte-refs))
                (let [[table col] (str/split (name node) #"\." 2)]
                  (keyword (str (get str-tables->cte-refs table) "." col)))

                :else node))]
      (if (empty? tables*)
        query
        (let [walked (walk/postwalk walker query)]
          (reduce (fn [query* table]
                    (update query* :with conj [(table tables->cte-refs) (branched-cte table)]))
                  walked
                  @replaced))))))

(methodical/defmethod t2.pipeline/build [#_query-type  :default
                                         #_model          :default
                                         #_resolved-query :default]
  [query-type model parsed-args resolved-query]
  (let [built (next-method query-type model parsed-args resolved-query)]
    (if (and branching/*enable-branch-hook*
             (not= query-type :toucan2.tools.before-update/select-for-before-update)
             (map? built)
             (not= model :model/Branch)
             (or (contains? built :select) (contains? built :union) (contains? built :union-all))
             (not= (:from built) [[:information_schema.columns]]))
      (substitute-ctes built (keys @branchables))
      built)))

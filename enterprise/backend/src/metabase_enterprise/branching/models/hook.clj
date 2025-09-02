(ns metabase-enterprise.branching.models.hook
  "Defines a toucan pipeline step hook that substitutes out tables that can be branched
  with CTEs that reflect their current state when branched."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [honey.sql :as sql]
   [medley.core :as m]
   [metabase.app-db.core :as mdb]
   [metabase.branching.core :as branching]
   [metabase.models.resolution :as models.resolution]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.pipeline :as t2.pipeline]
   [toucan2.query :as t2.query]))

(def ^:private branchables
  "Map of tables derving from :hook/branchable -> their columns."
  (delay
    (reduce-kv (fn [acc k _]
                 (cond-> acc
                   (isa? k :hook/branchable) (assoc (t2/table-name k) (map :column_name
                                                                           (t2/query {:select [:column_name]
                                                                                      :from   [[:information_schema.columns]]
                                                                                      :where  [:and [:= :table_name (case (mdb/db-type)
                                                                                                                      :h2 (u/upper-case-en (name (t2/table-name k)))
                                                                                                                      (name (t2/table-name k)))]]})))))
               {}
               models.resolution/model->namespace)))

(defn- branched-cte
  [table]
  (let [current-branch-id (:id @branching/*current-branch*)]
    {:select    (into [[[:coalesce :bm.original_id :branched.id] :id]]
                      (for [col-name (table @branchables)
                            :when (not (contains? #{"id" "ID"} col-name))]
                        (keyword (str "branched." col-name))))
     :from      [[table :branched]]
     :left-join [[:branch_model_mapping :bm]
                 [:and
                  [:= :bm.branched_model_id :branched.id]
                  [:= :bm.model_type [:inline (name table)]]]]
     :where     [:or
                 [:and [:is-not :bm.branched_model_id nil]
                  [:= :bm.branch_id current-branch-id]]
                 [:and
                  [:is :bm.branched_model_id nil]
                  [:not-exists
                   {:select [1]
                    :from   [[:branch_model_mapping :bm2]]
                    :where  [:and
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

(methodical/defmethod t2.pipeline/build [#_query-type :default
                                         #_model :default
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

(defn- model->type
  "Returns the model_type for the branch mapping for the given model."
  [model]
  (-> model
      t2/table-name
      name))

(defn- instance->type
  "Returns the model_type for the branch mapping for the given instance."
  [instance]
  (-> instance
      t2/model
      model->type))

(t2/define-after-insert :hook/branchable
  [instance]
  (when @branching/*current-branch*
    (t2/insert! :model/BranchModelMapping {:original_id       (:id instance)
                                           :branched_model_id (:id instance)
                                           :model_type        (instance->type instance)
                                           :branch_id         (:id @branching/*current-branch*)}))
  instance)

;(defn- on-current-branch?
;  [{:keys [id] :as instance}]
;  (and branching/*current-branch*
;    (t2/exists? :model/BranchModelMapping :original_id id :branch_id (:id @branching/*current-branch*) :model_type (instance->type instance))))

(defn- only-not-in-branch [where]
  (if branching/*current-branch*
    [:and where [:not-in :id {:select [:original_id]
                              :from   [:branch_model_mapping]
                              :where  [:= :branch_id (:id @branching/*current-branch*)]}]]
    where))

(defn- translate-pk [kv-args]
  (if branching/*current-branch*

    (m/update-existing kv-args :toucan/pk (fn [x] (or (t2/select-one-fn :branched_model_id [:model/BranchModelMapping :branched_model_id]
                                                                        :original_id x
                                                                        :branch_id (:id @branching/*current-branch*)) x)))
    kv-args))

;(defn- add-only-in-branch [where]
;  (if branching/*current-branch*
;    [:and where [:in :id {:select [:branched_model_id]
;                          :from   [:branch_model_mapping]
;                          :where  [:= :branch_id (:id @branching/*current-branch*)]}]]
;    [:and where [:not-in :id {:select [:branched_model_id]
;                              :from   [:branch_model_mapping]}]]))

(defn- copy-unbranched
  [model parsed-args]
  (when @branching/*current-branch*
    (let [db-type (mdb/db-type)
          kv-args (:kv-args parsed-args)
          query (-> (t2.query/apply-kv-args model {} kv-args)
                    (update :where only-not-in-branch))
          columns (map keyword (remove #(#{"id" "ID"} %) ((t2/table-name model) @branchables)))
          insert-half (first (sql/format {:insert-into [(t2/table-name model) columns]} {:inline true}))]
      (t2/with-connection [^java.sql.Connection conn]
        (doseq [to-copy-id (t2/select-pks-vec model query)]
          (let [inserted-id (-> (jdbc/execute! {:connection conn} (str insert-half " " (first (sql/format {:select columns
                                                                                                           :from   [(t2/table-name model)]
                                                                                                           :where  [:= :id to-copy-id]} {:inline true}))) {:returning-keys true})
                                first)]
            (t2/insert! :model/BranchModelMapping {:original_id       to-copy-id
                                                   :branched_model_id (:val (first (t2/query [(str "SELECT max(id) as val from " (name (t2/table-name model)))]))) ;; TODO: this is ugly for h2 vs using "RETURNING ID" and returning-keys seems to lie, is there a better way?
                                                   :model_type        (model->type model)
                                                   :branch_id         (:id @branching/*current-branch*)})))))))

(methodical/defmethod t2.pipeline/transduce-query [#_query-type :toucan.query-type/update.*
                                                   #_model :model/Transform ; TODO: make this :hook/branchable
                                                   #_resolved-query :default]
  [rf query-type model parsed-args resolved-query]
  (copy-unbranched model parsed-args)
  (next-method rf
               query-type
               model
               (update parsed-args :kv-args translate-pk)
               resolved-query))

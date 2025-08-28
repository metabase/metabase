(ns metabase-enterprise.branching.api
  "`/api/ee/branch/` routes"
  (:require
   [metabase-enterprise.branching.models.branch :as branch]
   [metabase-enterprise.branching.models.branch-model-mapping :as mapping]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.branching.core :as branching]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;;; ------------------------------------------------- Schemas -------------------------------------------------

(def BranchCreateRequest
  "Schema for creating a new branch."
  [:map
   [:name ms/NonBlankString]
   [:parent_branch_id {:optional true} [:maybe ms/PositiveInt]]])

(def BranchResponse
  "Schema for branch API responses."
  [:map
   [:id ms/PositiveInt]
   [:name :string]
   [:slug :string]
   [:creator_id ms/PositiveInt]
   [:parent_branch_id [:maybe ms/PositiveInt]]
   [:created_at ms/TemporalString]
   [:updated_at ms/TemporalString]])

(def DiffResponse
  "Schema for branch diff API responses."
  [:map
   [:id ms/PositiveInt]
   [:name :string]
   [:status [:enum "added" "modified" "deleted"]]
   [:content_type [:enum "card" "dashboard" "collection" "transform"]]
   [:current {:optional true} :map]
   [:original {:optional true} :map]])

;;; ------------------------------------------------- API Endpoints -------------------------------------------------

(api.macros/defendpoint :get "/"
  "Get all branches. If parent_id is specified, filter to branches with that parent. Set parent_id to -1 to get root-level branches."
  [_route-params
   {:keys [parent_id]} :- [:map
                           [:parent_id {:optional true} [:maybe ms/Int]]]]
  {:data (map #(select-keys % [:id :name :slug :creator_id :parent_branch_id :created_at :updated_at])
              (cond
                (nil? parent_id) (t2/select :model/Branch)
                (> 0 parent_id) (branch/get-children-by-id nil)
                :else (branch/get-children-by-id parent_id)))})

(api.macros/defendpoint :get "/:id/diff"
  "Get diff of changes in a branch compared to its parent branch. Open access for authenticated users."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (let [branch (t2/select-one :model/Branch :id id)]
    (when-not branch
      (throw (ex-info (tru "Branch not found.") {:status-code 404})))

    (let [mappings (t2/select :model/BranchModelMapping :branch_id id)
          card-mappings (filter #(= (:model_type %) "report_card") mappings)
          diff-entries (for [{:keys [original_id branched_model_id]} card-mappings]
                         (let [is-added? (= original_id branched_model_id)
                               is-deleted? (and original_id (nil? branched_model_id))
                               status (cond
                                        is-added? "added"
                                        is-deleted? "deleted"
                                        :else "modified")
                               original-card (when (and original_id (not is-added?))
                                               (binding [branching/*enable-branch-hook* false]
                                                 (t2/select-one :model/Card :id original_id)))
                               current-card (when branched_model_id
                                              (binding [branching/*enable-branch-hook* false]
                                                (t2/select-one :model/Card :id branched_model_id)))
                               card-fields [:id :name :description :dataset_query :display :visualization_settings :database_id]]

                           {:id (or branched_model_id original_id)
                            :name (or (:name current-card) (:name original-card) "Unknown")
                            :status status
                            :content_type "card"
                            :current (when current-card (select-keys current-card card-fields))
                            :original (when original-card (select-keys original-card card-fields))}))]

      ;; Add mocked transforms for demo purposes
      (let [mock-transforms [{:id 1001
                              :name "Sales Report Transform"
                              :status "added"
                              :content_type "transform"
                              :current {:id 1001
                                        :name "Sales Report Transform"
                                        :description "Transform sales data for reporting"
                                        :source {:type "query"
                                                 :query {:database 1
                                                         :type "query"
                                                         :query {:source-table 2
                                                                 :aggregation [["count"]]
                                                                 :breakout [["field" 13 {:temporal-unit "month"}]]}}}
                                        :target {:type "table"
                                                 :name "sales_monthly"
                                                 :schema "analytics"}}
                              :original nil}
                             {:id 1002
                              :name "User Metrics SQL Transform"
                              :status "modified"
                              :content_type "transform"
                              :current {:id 1002
                                        :name "User Metrics SQL Transform"
                                        :description "SQL transform for user analytics"
                                        :source {:type "query"
                                                 :query {:database 1
                                                         :type "native"
                                                         :native {:query "SELECT user_id, COUNT(*) as order_count FROM orders WHERE created_at > '2024-01-01' GROUP BY user_id"}}}
                                        :target {:type "table"
                                                 :name "user_metrics"
                                                 :schema "analytics"}}
                              :original {:id 1002
                                         :name "User Metrics SQL Transform"
                                         :description "SQL transform for user analytics"
                                         :source {:type "query"
                                                  :query {:database 1
                                                          :type "native"
                                                          :native {:query "SELECT user_id, COUNT(*) as order_count FROM orders GROUP BY user_id"}}}
                                         :target {:type "table"
                                                  :name "user_metrics"
                                                  :schema "analytics"}}}
                             {:id 1003
                              :name "Deleted Transform"
                              :status "deleted"
                              :content_type "transform"
                              :current nil
                              :original {:id 1003
                                         :name "Deleted Transform"
                                         :description "This transform was removed"
                                         :source {:type "query"
                                                  :query {:database 1
                                                          :type "query"
                                                          :query {:source-table 3}}}
                                         :target {:type "table"
                                                  :name "old_table"
                                                  :schema "temp"}}}]
            all-entries (concat diff-entries mock-transforms)]
        {:data all-entries}))))

(api.macros/defendpoint :get "/:id"
  "Get a single branch by ID."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (or (some-> (t2/select-one :model/Branch :id id)
              (select-keys [:id :name :slug :creator_id :parent_branch_id :created_at :updated_at]))
      (throw (ex-info (tru "Branch not found.") {:status-code 404}))))

(api.macros/defendpoint :post "/"
  "Create a new branch."
  [_route-params
   _query-params
   {:keys [name parent_branch_id]} :- BranchCreateRequest]
  (when parent_branch_id
    ;; Validate parent branch exists
    (when-not (t2/exists? :model/Branch :id parent_branch_id)
      (throw (ex-info (tru "Parent branch does not exist.") {:status-code 400}))))

  ;; Create the branch
  (let [branch-data (cond-> {:name name
                             :creator_id api/*current-user-id*}
                      parent_branch_id (assoc :parent_branch_id parent_branch_id))
        new-id (t2/insert-returning-pk! :model/Branch branch-data)]
    (-> (t2/select-one :model/Branch :id new-id)
        (select-keys [:id :name :slug :creator_id :parent_branch_id :created_at :updated_at]))))

(api.macros/defendpoint :delete "/:id"
  "Delete a branch by ID. Open access for authenticated users."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (let [branch (t2/select-one :model/Branch :id id)]
    (when-not branch
      (throw (ex-info (tru "Branch not found.") {:status-code 404})))

    ;; Check if there are child branches
    (when (branch/get-has-children? branch)
      (throw (ex-info (tru "Cannot delete branch with child branches.") {:status-code 400})))

    (t2/delete! :model/Branch :id id)
    api/generic-204-no-content))

;;; ------------------------------------------------- Routes -------------------------------------------------

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/branch/` routes."
  (api.macros/ns-handler *ns* +auth))

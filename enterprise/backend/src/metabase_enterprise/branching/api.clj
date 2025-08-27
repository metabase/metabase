(ns metabase-enterprise.branching.api
  "`/api/ee/branch/` routes"
  (:require
   [metabase-enterprise.branching.models.branch :as branch]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
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

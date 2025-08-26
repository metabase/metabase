(ns metabase-enterprise.branching.api
  "`/api/ee/branch/` routes"
  (:require
   [metabase-enterprise.branching.models.branch :as branch]
   [metabase-enterprise.branching.models.branch-model-mapping :as mapping]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;;; ------------------------------------------------- Schemas -------------------------------------------------

(def BranchCreateRequest
  "Schema for creating a new branch."
  [:map
   [:name ms/NonBlankString]
   [:description {:optional true} [:maybe :string]]
   [:parent_branch_id {:optional true} [:maybe ms/PositiveInt]]])

(def BranchResponse
  "Schema for branch API responses."
  [:map
   [:id ms/PositiveInt]
   [:name :string]
   [:slug :string]
   [:description [:maybe :string]]
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
   [:content_type [:enum "card" "dashboard" "collection"]]
   [:current {:optional true} :map]
   [:original {:optional true} :map]])

;;; ------------------------------------------------- API Endpoints -------------------------------------------------

(api.macros/defendpoint :get "/"
  "Get all branches. Open access for authenticated users."
  [_route-params
   {:keys [parent_id]} :- [:map
                           [:parent_id {:optional true} [:maybe ms/PositiveInt]]]]
  {:data (map #(select-keys % [:id :name :slug :description :creator_id :parent_branch_id :created_at :updated_at])
              (if parent_id
                (branch/branches-by-parent-id parent_id)
                (t2/select :model/Branch)))})

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
                               status (if is-added? "added" "modified")
                               original-card (when-not is-added?
                                               (t2/select-one :model/Card :id original_id))
                               branched-card (t2/select-one :model/Card :id branched_model_id)
                               card-fields [:id :name :description :dataset_query :display :visualization_settings]]

                           {:id branched_model_id
                            :name (or (:name branched-card) (:name original-card) "Unknown")
                            :status status
                            :content_type "card"
                            :current (when branched-card (select-keys branched-card card-fields))
                            :original (when original-card (select-keys original-card card-fields))}))]

      {:data diff-entries})))

(api.macros/defendpoint :get "/:id"
  "Get a single branch by ID. Open access for authenticated users."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (or (some-> (t2/select-one :model/Branch :id id)
              (select-keys [:id :name :slug :description :creator_id :parent_branch_id :created_at :updated_at]))
      (throw (ex-info (tru "Branch not found.") {:status-code 404}))))

(api.macros/defendpoint :post "/"
  "Create a new branch. Open access for authenticated users."
  [_route-params
   _query-params
   {:keys [name description parent_branch_id]} :- BranchCreateRequest]
  (when parent_branch_id
    ;; Validate parent branch exists
    (when-not (t2/exists? :model/Branch :id parent_branch_id)
      (throw (ex-info (tru "Parent branch does not exist.") {:status-code 400}))))

  ;; Create the branch
  (let [branch-data (cond-> {:name name
                             :creator_id api/*current-user-id*}
                      description (assoc :description description)
                      parent_branch_id (assoc :parent_branch_id parent_branch_id))
        new-id (t2/insert-returning-pk! :model/Branch branch-data)]
    (-> (t2/select-one :model/Branch :id new-id)
        (select-keys [:id :name :slug :description :creator_id :parent_branch_id :created_at :updated_at]))))

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

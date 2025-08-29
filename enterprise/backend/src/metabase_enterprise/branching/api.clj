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
   [:parent_branch_id {:optional true} [:maybe ms/Int]]])

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
  {:data (into [{:id               -1
                 :name             "main"
                 :slug             "main"
                 :creator_id       1
                 :parent_branch_id nil
                 :created_at       "1970-01-01T00:00:00Z"
                 :updated_at       "1970-01-01T00:00:00Z"}]
               (map #(select-keys % [:id :name :slug :creator_id :parent_branch_id :created_at :updated_at])
                    (cond
                      (nil? parent_id) (t2/select :model/Branch)
                      (> 0 parent_id) (branch/get-children-by-id nil)
                      :else (branch/get-children-by-id parent_id))))})

(api.macros/defendpoint :get "/:id/diff"
  "Get diff of changes in a branch compared to its parent branch. Open access for authenticated users."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (let [branch (t2/select-one :model/Branch :id id)]
    (when-not branch
      (throw (ex-info (tru "Branch not found.") {:status-code 404})))

    (let [mappings (t2/select :model/BranchModelMapping :branch_id id)
          card-mappings (filter #(= (:model_type %) "report_card") mappings)
          transform-mappings (filter #(= (:model_type %) "transform") mappings)

          card-diff-entries (for [{:keys [original_id branched_model_id]} card-mappings]
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
                                 :original (when original-card (select-keys original-card card-fields))}))

          transform-diff-entries (for [{:keys [original_id branched_model_id]} transform-mappings]
                                   (let [is-added? (= original_id branched_model_id)
                                         is-deleted? (and original_id (nil? branched_model_id))
                                         status (cond
                                                  is-added? "added"
                                                  is-deleted? "deleted"
                                                  :else "modified")
                                         original-transform (when (and original_id (not is-added?))
                                                              (binding [branching/*enable-branch-hook* false]
                                                                (t2/select-one :model/Transform :id original_id)))
                                         current-transform (when branched_model_id
                                                             (binding [branching/*enable-branch-hook* false]
                                                               (t2/select-one :model/Transform :id branched_model_id)))
                                         transform-fields [:id :name :description :source :target :run_trigger]]

                                     {:id (or branched_model_id original_id)
                                      :name (or (:name current-transform) (:name original-transform) "Unknown")
                                      :status status
                                      :content_type "transform"
                                      :current (when current-transform (select-keys current-transform transform-fields))
                                      :original (when original-transform (select-keys original-transform transform-fields))}))

          all-entries (concat card-diff-entries transform-diff-entries)]

      {:data all-entries})))

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
  (let [parent_branch_id (if (= -1 parent_branch_id) nil parent_branch_id)]
    (when parent_branch_id
      ;; Validate parent branch exists
      (when-not (t2/exists? :model/Branch :id parent_branch_id)
        (throw (ex-info (tru "Parent branch does not exist.") {:status-code 400}))))

    ;; Create the branch
    (let [branch-data (cond-> {:name       name
                               :creator_id api/*current-user-id*}
                        parent_branch_id (assoc :parent_branch_id parent_branch_id))
          new-id (t2/insert-returning-pk! :model/Branch branch-data)]
      (-> (t2/select-one :model/Branch :id new-id)
          (select-keys [:id :name :slug :creator_id :parent_branch_id :created_at :updated_at])))))

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

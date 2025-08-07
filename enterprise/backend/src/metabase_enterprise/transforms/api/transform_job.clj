(ns metabase-enterprise.transforms.api.transform-job
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(api.macros/defendpoint :post "/"
  "Create a new transform job."
  [_route-params
   _query-params
   {:keys [name description schedule tag_ids]} :- [:map
                                                   [:name :string]
                                                   [:description {:optional true} [:maybe :string]]
                                                   [:schedule :string]
                                                   [:tag_ids {:optional true} [:sequential ms/PositiveInt]]]]
  (log/info "create job (dummy)")
  (api/check-superuser)
  {:id          1
   :name        name
   :description description
   :schedule    schedule
   :tag_ids     (or tag_ids [])})

(api.macros/defendpoint :put "/:job-id"
  "Update a transform job."
  [{:keys [job-id]} :- [:map
                        [:job-id ms/PositiveInt]]
   _query-params
   {:keys [name description schedule tag_ids]} :- [:map
                                                   [:name {:optional true} :string]
                                                   [:description {:optional true} [:maybe :string]]
                                                   [:schedule {:optional true} :string]
                                                   [:tag_ids {:optional true} [:sequential ms/PositiveInt]]]]
  (log/info "update transform job (dummy)")
  (api/check-superuser)
  {:id          job-id
   :name        (or name "Updated Job")
   :description description
   :schedule    (or schedule "0 0 * * * ? *")
   :tag_ids     (or tag_ids [])})

(api.macros/defendpoint :delete "/:job-id"
  "Delete a transform job."
  [_job :- [:map [:job-id ms/PositiveInt]]]
  (log/info "delete job (dummy)")
  (api/check-superuser)
  nil)

(api.macros/defendpoint :post "/:job-id/execute"
  "Execute a transform job manually."
  [_job :- [:map [:job-id ms/PositiveInt]]]
  (log/info "execute transform job (dummy)")
  (api/check-superuser)
  {:message    "Job execution started"
   :job_run_id 123})

(api.macros/defendpoint :get "/:job-id"
  "Get a transform job by ID."
  [{:keys [job-id]} :- [:map
                        [:job-id ms/PositiveInt]]]
  (log/info "get transform job (dummy)")
  (api/check-superuser)
  {:id             job-id
   :name           "Sample Job"
   :description    "Sample job description"
   :schedule       "0 0 * * * ? *"
   :tag_ids        [1 2]
   :last_execution {:status "succeeded"
                    :trigger "schedule"
                    :start_time "2024-01-01T10:00:00Z"
                    :end_time "2024-01-01T10:05:00Z"}})

(api.macros/defendpoint :get "/"
  "Get all transform jobs."
  [_route-params
   _query-params]
  (log/info "get all transform jobs (dummy)")
  (api/check-superuser)
  [{:id             1
    :name           "Sample Job 1"
    :description    "First sample job"
    :schedule       "0 0 * * * ? *"
    :tag_ids        [1]
    :last_execution {:status "succeeded"
                     :trigger "schedule"
                     :start_time "2024-01-01T10:00:00Z"
                     :end_time "2024-01-01T10:05:00Z"}}
   {:id             2
    :name           "Sample Job 2"
    :description    nil
    :schedule       "0 */4 * * *"
    :tag_ids        [1 2]
    :last_execution nil}])

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/transform-job` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))

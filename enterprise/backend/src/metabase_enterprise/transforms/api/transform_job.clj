(ns metabase-enterprise.transforms.api.transform-job
  (:require
   [metabase-enterprise.transforms.jobs :as jobs]
   [metabase-enterprise.transforms.models.transform-job :as transform-job]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (org.quartz CronExpression)))

(set! *warn-on-reflection* true)

(comment transform-job/keep-me)

(api.macros/defendpoint :post "/"
  "Create a new transform job."
  [_route-params
   _query-params
   {:keys [name description schedule tag_ids]} :- [:map
                                                   [:name ms/NonBlankString]
                                                   [:description {:optional true} [:maybe ms/NonBlankString]]
                                                   [:schedule ms/NonBlankString]
                                                   [:tag_ids {:optional true} [:sequential ms/PositiveInt]]]]
  (log/info "Creating transform job:" name "with schedule:" schedule)
  (api/check-superuser)
  ;; Validate cron expression
  (api/check-400 (try
                   (CronExpression/validateExpression schedule)
                   true
                   (catch Exception e
                     false))
                 (deferred-tru "Invalid cron expression: {0}" schedule))
  ;; Validate tag IDs exist if provided
  (when (seq tag_ids)
    (let [existing-tags (set (t2/select-pks-vec :model/TransformTag :id [:in tag_ids]))]
      (api/check-400 (= (set tag_ids) existing-tags)
                     (deferred-tru "Some tag IDs do not exist"))))
  (let [job (t2/insert-returning-instance! :model/TransformJob
                                           {:name name
                                            :description description
                                            :schedule schedule})]
    ;; Add tag associations if provided
    (when (seq tag_ids)
      (t2/insert! :transform_job_tags
                  (for [tag-id tag_ids]
                    {:job_id (:id job)
                     :tag_id tag-id})))
    ;; Return with hydrated tag_ids
    (t2/hydrate job :tag_ids)))

(api.macros/defendpoint :put "/:job-id"
  "Update a transform job."
  [{:keys [job-id]} :- [:map
                        [:job-id ms/PositiveInt]]
   _query-params
   {:keys [name description schedule tag_ids]} :- [:map
                                                   [:name {:optional true} ms/NonBlankString]
                                                   [:description {:optional true} [:maybe ms/NonBlankString]]
                                                   [:schedule {:optional true} ms/NonBlankString]
                                                   [:tag_ids {:optional true} [:sequential ms/PositiveInt]]]]
  (log/info "Updating transform job" job-id)
  (api/check-superuser)
  ;; Check job exists
  (api/check-404 (t2/select-one :model/TransformJob :id job-id))
  ;; Validate cron expression if provided
  (when schedule
    (api/check-400 (try
                     (CronExpression/validateExpression schedule)
                     true
                     (catch Exception e
                       false))
                   (deferred-tru "Invalid cron expression: {0}" schedule)))
  ;; Validate tag IDs if provided
  (when tag_ids
    (let [existing-tags (set (t2/select-pks-vec :model/TransformTag :id [:in tag_ids]))]
      (api/check-400 (= (set tag_ids) existing-tags)
                     (deferred-tru "Some tag IDs do not exist"))))
  ;; Update the job
  (let [updates (cond-> {}
                  name (assoc :name name)
                  (some? description) (assoc :description description)
                  schedule (assoc :schedule schedule))]
    (when (seq updates)
      (t2/update! :model/TransformJob job-id updates)))
  ;; Update tag associations if provided
  (when (some? tag_ids)
    ;; Delete existing associations
    (t2/delete! :transform_job_tags :job_id job-id)
    ;; Add new associations
    (when (seq tag_ids)
      (t2/insert! :transform_job_tags
                  (for [tag-id tag_ids]
                    {:job_id job-id
                     :tag_id tag-id}))))
  ;; Return updated job with hydration
  (-> (t2/select-one :model/TransformJob :id job-id)
      (t2/hydrate :tag_ids)
      (assoc :last_execution nil)))

(api.macros/defendpoint :delete "/:job-id"
  "Delete a transform job."
  [{:keys [job-id]} :- [:map [:job-id ms/PositiveInt]]]
  (log/info "Deleting transform job" job-id)
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/TransformJob :id job-id))
  (t2/delete! :model/TransformJob :id job-id)
  api/generic-204-no-content)

(api.macros/defendpoint :post "/:job-id/execute"
  "Execute a transform job manually."
  [{:keys [job-id]} :- [:map [:job-id ms/PositiveInt]]]
  (log/info "Manual execution of transform job" job-id)
  (api/check-superuser)
  (let [job (api/check-404 (t2/select-one :model/TransformJob :id job-id))]
    (u.jvm/in-virtual-thread* (jobs/execute-jobs! [job-id] {:run-method :manual})))
  {:message    "Job execution started"
   :job_run_id (str "stub-" job-id "-" (System/currentTimeMillis))})

(api.macros/defendpoint :get "/:job-id"
  "Get a transform job by ID."
  [{:keys [job-id]} :- [:map
                        [:job-id ms/PositiveInt]]]
  (log/info "Getting transform job" job-id)
  (api/check-superuser)
  (let [job (api/check-404 (t2/select-one :model/TransformJob :id job-id))]
    ;; Hydrate tag_ids and add last_execution (null for now)
    (-> job
        (t2/hydrate :tag_ids)
        (assoc :last_execution nil))))

(api.macros/defendpoint :get "/"
  "Get all transform jobs."
  [_route-params
   _query-params]
  (log/info "Getting all transform jobs")
  (api/check-superuser)
  (let [jobs (t2/select :model/TransformJob {:order-by [[:created_at :desc]]})]
    ;; Hydrate tag_ids for all jobs
    ;; Note: last_execution will be null until execution tracking is implemented
    (map #(assoc % :last_execution nil)
         (t2/hydrate jobs :tag_ids))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/transform-job` routes."
  (api.macros/ns-handler *ns* +auth))

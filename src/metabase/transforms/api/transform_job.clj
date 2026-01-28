(ns metabase.transforms.api.transform-job
  (:require
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.models.interface :as mi]
   [metabase.models.transforms.transform :as transform]
   [metabase.models.transforms.transform-job :as transform-job]
   [metabase.permissions.core :as perms]
   [metabase.transforms.jobs :as transforms.jobs]
   [metabase.transforms.schedule :as transforms.schedule]
   [metabase.transforms.util :as transforms.util]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(comment transform-job/keep-me)

(def ^:private ui-display-types [:cron/raw :cron/builder])

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Create a new transform job."
  [_route-params
   _query-params
   {:keys [name description schedule ui_display_type tag_ids]} :- [:map
                                                                   [:name ms/NonBlankString]
                                                                   [:description {:optional true} [:maybe ms/NonBlankString]]
                                                                   [:schedule ms/NonBlankString]
                                                                   [:ui_display_type
                                                                    {:default :cron/raw}
                                                                    (ms/enum-decode-keyword ui-display-types)]
                                                                   [:tag_ids {:optional true} [:sequential ms/PositiveInt]]]]
  (log/info "Creating transform job:" name "with schedule:" schedule)
  ;; Validate cron expression
  (api/check-400 (transforms.schedule/validate-cron-expression schedule)
                 (deferred-tru "Invalid cron expression: {0}" schedule))
  ;; Validate tag IDs exist if provided
  (when (seq tag_ids)
    (let [existing-tags (set (t2/select-pks-vec :model/TransformTag :id [:in tag_ids]))]
      (api/check-400 (= (set tag_ids) existing-tags)
                     (deferred-tru "Some tag IDs do not exist"))))
  (let [job-data {:name            name
                  :description     description
                  :schedule        schedule
                  :ui_display_type ui_display_type}
        _        (api/check-403 (mi/can-create? :model/TransformJob (assoc job-data :tag_ids tag_ids)))
        job      (t2/insert-returning-instance! :model/TransformJob
                                                job-data)]
    (transforms.schedule/initialize-job! job)
    ;; Add tag associations if provided
    (when (seq tag_ids)
      (t2/insert! :model/TransformJobTransformTag
                  (map-indexed (fn [idx tag-id]
                                 {:job_id (:id job)
                                  :tag_id tag-id
                                  :position idx})
                               tag_ids)))
    ;; Return with hydrated tag_ids
    (t2/hydrate job :tag_ids)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/:job-id"
  "Update a transform job."
  [{:keys [job-id]} :- [:map
                        [:job-id ms/PositiveInt]]
   _query-params
   {tag-ids :tag_ids
    :keys [name description schedule ui_display_type]} :- [:map
                                                           [:name {:optional true} ms/NonBlankString]
                                                           [:description {:optional true} [:maybe ms/NonBlankString]]
                                                           [:schedule {:optional true} ms/NonBlankString]
                                                           [:ui_display_type
                                                            {:optional true}
                                                            (ms/enum-decode-keyword ui-display-types)]
                                                           [:tag_ids {:optional true} [:sequential ms/PositiveInt]]]]
  (log/info "Updating transform job" job-id)
  (let [existing-job (t2/hydrate (t2/select-one :model/TransformJob :id job-id) :tag_ids)]
    ;; Check write permission on both current state and final state (with new tags if provided)
    (api/write-check existing-job)
    (when (some? tag-ids)
      (api/write-check (assoc existing-job :tag_ids tag-ids))))
  ;; Validate cron expression if provided
  (when schedule
    (api/check-400 (transforms.schedule/validate-cron-expression schedule)
                   (deferred-tru "Invalid cron expression: {0}" schedule)))
  ;; Validate tag IDs if provided
  (when (seq tag-ids)
    (let [existing-tags (set (t2/select-pks-vec :model/TransformTag :id [:in tag-ids]))]
      (api/check-400 (= (set tag-ids) existing-tags)
                     (deferred-tru "Some tag IDs do not exist"))))
  (t2/with-transaction [_conn]
    (when-let [updates (m/assoc-some nil
                                     :name name
                                     :description description
                                     :schedule schedule
                                     :ui_display_type ui_display_type)]
      (t2/update! :model/TransformJob job-id updates))
    (when schedule
      (transforms.schedule/update-job! job-id schedule))
    ;; Update tag associations if provided
    (when (some? tag-ids)
      (transform-job/update-job-tags! job-id tag-ids))
    ;; Return updated job with hydration
    (-> (t2/select-one :model/TransformJob :id job-id)
        (t2/hydrate :tag_ids :last_run))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:job-id"
  "Delete a transform job."
  [{:keys [job-id]} :- [:map [:job-id ms/PositiveInt]]]
  (log/info "Deleting transform job" job-id)
  (api/write-check (t2/hydrate (t2/select-one :model/TransformJob :id job-id) :tag_ids))
  (t2/delete! :model/TransformJob :id job-id)
  (transforms.schedule/delete-job! job-id)
  api/generic-204-no-content)

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/:job-id/run"
  "Run a transform job manually."
  [{:keys [job-id]} :- [:map [:job-id ms/PositiveInt]]]
  (log/info "Manual run of transform job" job-id)
  (api/write-check (t2/select-one :model/TransformJob :id job-id))
  (u.jvm/in-virtual-thread*
   (try
     (transforms.jobs/run-job! job-id {:run-method :manual
                                       :user-id api/*current-user-id*})
     (catch Throwable t
       (log/error "Error executing transform job" job-id)
       (log/error t))))
  {:message "Job run started"
   :job_run_id (str "stub-" job-id "-" (System/currentTimeMillis))})

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:job-id"
  "Get a transform job by ID."
  [{:keys [job-id]} :- [:map
                        [:job-id ms/PositiveInt]]]
  (log/info "Getting transform job" job-id)
  (-> (api/read-check (t2/select-one :model/TransformJob :id job-id))
      (t2/hydrate :tag_ids :last_run)))

(defn- add-next-run
  [{id :id :as job}]
  (if-let [start-time (-> id transforms.schedule/existing-trigger :next-fire-time)]
    (assoc job :next_run {:start_time (str (transforms.util/->instant start-time))})
    job))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:job-id/transforms"
  "Get the transforms of job specified by the job's ID."
  [{:keys [job-id]} :- [:map
                        [:job-id ms/PositiveInt]]]
  (log/info "Getting the transforms of transform job" job-id)
  (api/check-404 (t2/select-one-pk :model/TransformJob :id job-id))
  (-> (transforms.jobs/job-transforms job-id)
      (#(do (api/check-403 (every? mi/can-read? %)) %))
      (t2/hydrate :creator)
      transforms.util/add-source-readable))

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "Get all transform jobs."
  [_route-params
   {:keys [last_run_start_time next_run_start_time last_run_statuses tag_ids]} :-
   [:map
    [:last_run_start_time {:optional true} [:maybe ms/NonBlankString]]
    [:next_run_start_time {:optional true} [:maybe ms/NonBlankString]]
    [:last_run_statuses {:optional true} [:maybe (ms/QueryVectorOf [:enum "started" "succeeded" "failed" "timeout"])]]
    [:tag_ids {:optional true} [:maybe (ms/QueryVectorOf ms/IntGreaterThanOrEqualToZero)]]]]
  (log/info "Getting all transform jobs")
  (api/check-403 api/*is-data-analyst?*)
  (let [jobs (t2/select :model/TransformJob {:order-by [[:created_at :desc]]})]
    (into []
          (comp (map add-next-run)
                (transforms.util/->date-field-filter-xf [:last_run :start_time] last_run_start_time)
                (transforms.util/->date-field-filter-xf [:next_run :start_time] next_run_start_time)
                (transforms.util/->status-filter-xf [:last_run :status] last_run_statuses)
                (transforms.util/->tag-filter-xf [:tag_ids] tag_ids)
                (map #(update % :last_run transforms.util/localize-run-timestamps))
                (map #(update % :next_run transforms.util/localize-run-timestamps)))
          (t2/hydrate jobs :tag_ids :last_run))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/transform-job` routes."
  (api.macros/ns-handler *ns* +auth))

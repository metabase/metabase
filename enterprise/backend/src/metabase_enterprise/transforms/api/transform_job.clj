(ns metabase-enterprise.transforms.api.transform-job
  (:require
   [clojure.set :as set]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase-enterprise.transforms.jobs :as transforms.jobs]
   [metabase-enterprise.transforms.models.transform-job :as transform-job]
   [metabase-enterprise.transforms.schedule :as transforms.schedule]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.driver :as driver]
   [metabase.driver.common.parameters.dates :as params.dates]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (java.time Instant LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime ZoneId)))

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
  (api/check-400 (transforms.schedule/validate-cron-expression schedule)
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

(api.macros/defendpoint :put "/:job-id"
  "Update a transform job."
  [{:keys [job-id]} :- [:map
                        [:job-id ms/PositiveInt]]
   _query-params
   {tag-ids :tag_ids
    :keys [name description schedule]} :- [:map
                                           [:name {:optional true} ms/NonBlankString]
                                           [:description {:optional true} [:maybe ms/NonBlankString]]
                                           [:schedule {:optional true} ms/NonBlankString]
                                           [:tag_ids {:optional true} [:sequential ms/PositiveInt]]]]
  (log/info "Updating transform job" job-id)
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/TransformJob :id job-id))
  ;; Validate cron expression if provided
  (when schedule
    (api/check-400 (transforms.schedule/validate-cron-expression schedule)
                   (deferred-tru "Invalid cron expression: {0}" schedule)))
  ;; Validate tag IDs if provided
  (when tag-ids
    (let [existing-tags (set (t2/select-pks-vec :model/TransformTag :id [:in tag-ids]))]
      (api/check-400 (= (set tag-ids) existing-tags)
                     (deferred-tru "Some tag IDs do not exist"))))
  (t2/with-transaction [_conn]
    (when-let [updates (m/assoc-some nil
                                     :name name
                                     :description description
                                     :schedule schedule)]
      (t2/update! :model/TransformJob job-id updates))
    (when schedule
      (transforms.schedule/update-job! job-id schedule))
    ;; Update tag associations if provided
    (when (some? tag-ids)
      (transform-job/update-job-tags! job-id tag-ids))
    ;; Return updated job with hydration
    (-> (t2/select-one :model/TransformJob :id job-id)
        (t2/hydrate :tag_ids :last_run))))

(api.macros/defendpoint :delete "/:job-id"
  "Delete a transform job."
  [{:keys [job-id]} :- [:map [:job-id ms/PositiveInt]]]
  (log/info "Deleting transform job" job-id)
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/TransformJob :id job-id))
  (t2/delete! :model/TransformJob :id job-id)
  (transforms.schedule/delete-job! job-id)
  api/generic-204-no-content)

(api.macros/defendpoint :post "/:job-id/run"
  "Run a transform job manually."
  [{:keys [job-id]} :- [:map [:job-id ms/PositiveInt]]]
  (log/info "Manual run of transform job" job-id)
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/TransformJob :id job-id))
  (u.jvm/in-virtual-thread*
   (try
     (transforms.jobs/run-job! job-id {:run-method :manual})
     (catch Throwable t
       (log/error "Error executing transform job" job-id)
       (log/error t))))
  {:message "Job run started"
   :job_run_id (str "stub-" job-id "-" (System/currentTimeMillis))})

(api.macros/defendpoint :get "/:job-id"
  "Get a transform job by ID."
  [{:keys [job-id]} :- [:map
                        [:job-id ms/PositiveInt]]]
  (log/info "Getting transform job" job-id)
  (api/check-superuser)
  (let [job (api/check-404 (t2/select-one :model/TransformJob :id job-id))]
    (t2/hydrate job :tag_ids :last_run)))

(defn- report-zone-id
  ^ZoneId []
  (if-let [zone-name (driver/report-timezone)]
    (t/zone-id zone-name)
    (t/zone-id)))

(defn- report-local-date
  []
  (.toLocalDate (t/zoned-date-time (report-zone-id))))

(defn- ->instant
  ^Instant [t]
  (when t
    (condp instance? t
      Instant        t
      OffsetDateTime (.toInstant ^OffsetDateTime t)
      ZonedDateTime  (.toInstant ^ZonedDateTime t)
      LocalDateTime  (recur (.atZone ^LocalDateTime t (report-zone-id)))
      LocalTime      (recur (.atDate ^LocalTime t (report-local-date)))
      OffsetTime     (recur (.atDate ^OffsetTime t (report-local-date)))
      LocalDate      (recur (.atStartOfDay ^LocalDate t))
      (throw (ex-info (format "Cannot convert timestamp %s of type %s to an Instant" t (type t))
                      {:timestamp t})))))

(defn- add-next-run
  [{id :id :as job}]
  (if-let [start-time (-> id transforms.schedule/existing-trigger :next-fire-time)]
    (assoc job :next_run {:start_time (str (->instant start-time))})
    job))

(defn- matching-timestamp?
  [job field-path {:keys [start end]}]
  (when-let [field-instant (->instant (get-in job field-path))]
    (let [start-instant (some-> start u.date/parse ->instant)
          end-instant (some-> end u.date/parse ->instant)]
      (log/debug "matching-timestamp?" (pr-str [field-instant start-instant end-instant]))
      (and (or (nil? start)
               (not (.isBefore field-instant start-instant)))
           (or (nil? end)
               (.isAfter end-instant field-instant))))))

(defn- ->date-field-filter-xf
  [field-path filter-value]
  (let [range (some-> filter-value (params.dates/date-string->range {:inclusive-end? false}))]
    (if range
      (filter #(matching-timestamp? % field-path range))
      identity)))

(api.macros/defendpoint :get "/"
  "Get all transform jobs."
  [_route-params
   {:keys [last_run_start_time next_run_start_time transform_tag_ids]} :-
   [:map
    [:last_run_start_time {:optional true} [:maybe ms/NonBlankString]]
    [:next_run_start_time {:optional true} [:maybe ms/NonBlankString]]
    [:transform_tag_ids   {:optional true} [:maybe [:sequential :string]]]]]
  (log/info "Getting all transform jobs")
  (api/check-superuser)
  (let [jobs (t2/select :model/TransformJob {:order-by [[:created_at :desc]]})
        transform-tag-ids (-> transform_tag_ids set not-empty)]
    (into []
          (comp (map add-next-run)
                (->date-field-filter-xf [:last_run :start_time] last_run_start_time)
                (->date-field-filter-xf [:next_run :start_time] next_run_start_time)
                (if transform-tag-ids
                  (filter #(seq (set/intersection transform-tag-ids (:tag-_ids %))))
                  identity))
          (t2/hydrate jobs :tag_ids :last_run))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/transform-job` routes."
  (api.macros/ns-handler *ns* +auth))

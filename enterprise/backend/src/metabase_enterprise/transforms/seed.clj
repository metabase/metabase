(ns metabase-enterprise.transforms.seed
  "Seed default transform tags and jobs on startup.
  Creates default tags and jobs if none exist, ensuring transform functionality is ready to use."
  (:require
   [metabase.premium-features.core :as premium-features]
   [metabase.task.core :as task]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(def ^:private default-tags
  "Default transform tags that should be created on first startup."
  [{:name "hourly"}
   {:name "daily"}
   {:name "weekly"}
   {:name "monthly"}])

(def ^:private default-jobs
  "Default transform jobs that should be created on first startup.
  These correspond to the default tags and provide basic scheduling options."
  [{:name (deferred-tru "Hourly job")
    :description (deferred-tru "Executes transforms tagged with ''hourly'' every hour")
    :schedule "0 0 * * * ? *"
    :entity_id "hourly000000000000000"
    :tag_name "hourly"}
   {:name (deferred-tru "Daily job")
    :description (deferred-tru "Executes transforms tagged with ''daily'' once per day")
    :schedule "0 0 0 * * ? *"
    :entity_id "daily0000000000000000"
    :tag_name "daily"}
   {:name (deferred-tru "Weekly job")
    :description (deferred-tru "Executes transforms tagged with ''weekly'' once per week")
    :schedule "0 0 0 ? * 1 *"
    :entity_id "weekly000000000000000"
    :tag_name "weekly"}
   {:name (deferred-tru "Monthly job")
    :description (deferred-tru "Executes transforms tagged with ''monthly'' once per month")
    :schedule "0 0 0 1 * ? *"
    :entity_id "monthly00000000000000"
    :tag_name "monthly"}])

(defn seed-default-tags-and-jobs!
  "Create default transform tags and jobs if they don't exist.
  This function is idempotent and safe to call multiple times."
  []
  (log/info "Checking for default transform tags and jobs")
  (when (and (zero? (t2/count :transform_tag))
             (zero? (t2/count :transform_job)))
    (log/info "Creating default transform tags and jobs")
    (t2/with-transaction []
      ;; Create tags first
      (t2/insert! :transform_tag default-tags)
      (log/infof "Created %d default transform tags" (count default-tags))

      ;; Create jobs and link them to tags
      (doseq [{:keys [tag_name] :as job-def} default-jobs]
        (let [tag (t2/select-one :transform_tag :name tag_name)
              job-data (dissoc job-def :tag_name)
              job (t2/insert-returning-instance! :transform_job job-data)]
          ;; Link job to its corresponding tag
          (when (and tag job)
            (t2/insert! :transform_job_tags {:job_id (:id job) :tag_id (:id tag)}))))
      (log/infof "Created %d default transform jobs" (count default-jobs))))
  (log/info "Default transform setup complete"))

(defmethod task/init! ::SeedTransformDefaults [_]
  (when (premium-features/has-feature? :transforms)
    (seed-default-tags-and-jobs!)))
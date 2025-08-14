(ns metabase-enterprise.transforms.seed
  "Seed default transform tags and jobs on startup.
  Creates default tags and jobs if none exist, ensuring transform functionality is ready to use."
  (:require
   [metabase-enterprise.transforms.settings :as transforms.settings]
   [metabase.premium-features.core :as premium-features]
   [metabase.task.core :as task]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private default-tags
  "Default transform tags that should be created on first startup."
  [{:name (deferred-tru "hourly")
    :entity_id "hourly-transform-tag"}
   {:name (deferred-tru "daily")
    :entity_id "daily-transform-tag"}
   {:name (deferred-tru "weekly")
    :entity_id "weekly-transform-tag"}
   {:name (deferred-tru "monthly")
    :entity_id "monthly-transform-tag"}])

(def ^:private default-jobs
  "Default transform jobs that should be created on first startup.
  These correspond to the default tags and provide basic scheduling options."
  [{:name (deferred-tru "Hourly job")
    :description (deferred-tru "Executes transforms tagged with ''hourly'' every hour")
    :schedule "0 0 * * * ? *"
    :entity_id "hourly000000000000000"
    :tag_name (deferred-tru "hourly")}
   {:name (deferred-tru "Daily job")
    :description (deferred-tru "Executes transforms tagged with ''daily'' once per day")
    :schedule "0 0 0 * * ? *"
    :entity_id "daily0000000000000000"
    :tag_name (deferred-tru "daily")}
   {:name (deferred-tru "Weekly job")
    :description (deferred-tru "Executes transforms tagged with ''weekly'' once per week")
    :schedule "0 0 0 ? * 1 *"
    :entity_id "weekly000000000000000"
    :tag_name (deferred-tru "weekly")}
   {:name (deferred-tru "Monthly job")
    :description (deferred-tru "Executes transforms tagged with ''monthly'' once per month")
    :schedule "0 0 0 1 * ? *"
    :entity_id "monthly00000000000000"
    :tag_name (deferred-tru "monthly")}])

(defn seed-default-tags-and-jobs!
  "Create default transform tags and jobs if they haven't been seeded before.
  Uses a setting to track whether seeding has occurred, so user-deleted tags/jobs won't be recreated."
  []
  (log/info "Checking if default transform tags and jobs have been seeded")
  (when-not (transforms.settings/transforms-seeded)
    (log/info "First time setup - creating default transform tags and jobs")
    (t2/with-transaction [_conn]
      ;; Create tags first
      (t2/insert! :transform_tag (map #(update % :name str) default-tags))
      (log/infof "Created %d default transform tags" (count default-tags))

      ;; Create jobs and link them to tags
      (doseq [{:keys [tag_name] :as job-def} default-jobs]
        (let [tag (t2/select-one :transform_tag :name (str tag_name))
              job-data (-> (dissoc job-def :tag_name)
                           (update :name str)
                           (update :description str))
              job (t2/insert-returning-instance! :transform_job job-data)]
          ;; Link job to its corresponding tag
          (when (and tag job)
            (t2/insert! :transform_job_tags {:job_id (:id job) :tag_id (:id tag)
                                             :entity_id (str (subs (:entity_id job) 0 16) "-join")}))))
      (log/infof "Created %d default transform jobs" (count default-jobs))

      ;; Mark that we've seeded the defaults
      (transforms.settings/transforms-seeded! true)))
  (log/info "Default transform setup complete"))

(defmethod task/init! ::SeedTransformDefaults [_]
  (when (premium-features/has-feature? :transforms)
    (seed-default-tags-and-jobs!)))

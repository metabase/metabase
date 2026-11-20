(ns metabase.transforms.models.transform-job-test
  "Tests for the transform job model."
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.events.core :as events]
   [metabase.events.test-util :as events.tu]
   [metabase.models.interface :as mi]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.test :as mt]
   [metabase.transforms.models.transform-job :as transform-job]
   [metabase.transforms.schedule :as transforms.schedule]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.transforms.write :as transforms.write]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(comment transform-job/keep-me)

(def ^:private values {"hourly"
                       {:name (i18n/deferred-trs "Hourly job")
                        :description (i18n/deferred-trs "Executes transforms tagged with ''hourly'' every hour")}

                       "daily"
                       {:name (i18n/deferred-trs "Daily job")
                        :description (i18n/deferred-trs "Executes transforms tagged with ''daily'' once per day")}

                       "weekly"
                       {:name (i18n/deferred-trs "Weekly job")
                        :description (i18n/deferred-trs "Executes transforms tagged with ''weekly'' once per week")}

                       "monthly"
                       {:name (i18n/deferred-trs "Monthly job")
                        :description (i18n/deferred-trs "Executes transforms tagged with ''monthly'' once per month")}})

(deftest initial-jobs-translated-on-select
  (doseq [[type translations] values]
    (mt/with-temp [:model/TransformJob job
                   {:name "default"
                    :description "default description"
                    :schedule "0 0 0 * * ?"
                    :built_in_type type}]
      (is (= (str (:name translations))
             (str (:name (t2/select-one :model/TransformJob :id (:id job))))))
      (is (= (str (:description translations))
             (str (:description (t2/select-one :model/TransformJob :id (:id job)))))))))

(deftest initial-jobs-translated-on-update
  (testing "Setting name still translates description"
    (doseq [[type translations] values]
      (mt/with-temp [:model/TransformJob job
                     {:name "default"
                      :description "default description"
                      :schedule "0 0 0 * * ?"
                      :built_in_type type}]
        (transforms.write/update-job! (:id job) {:name "default2"} {})
        (is (= "default2"
               (str (:name (t2/select-one :model/TransformJob :id (:id job))))))
        (is (= (str (:description translations))
               (str (:description (t2/select-one :model/TransformJob :id (:id job)))))))))
  (testing "Setting description still translates name"
    (doseq [[type translations] values]
      (mt/with-temp [:model/TransformJob job
                     {:name "default"
                      :description "default description"
                      :schedule "0 0 0 * * ?"
                      :built_in_type type}]
        (transforms.write/update-job! (:id job) {:description "default description 2"} {})
        (is (= "default description 2"
               (str (:description (t2/select-one :model/TransformJob :id (:id job))))))
        (is (= (str (:name translations))
               (str (:name (t2/select-one :model/TransformJob :id (:id job)))))))))
  (testing "Setting schedule translates description and name"
    (doseq [[type translations] values]
      (mt/with-temp [:model/TransformJob job
                     {:name "default"
                      :description "default description"
                      :schedule "0 0 0 * * ?"
                      :built_in_type type}]
        (transforms.write/update-job! (:id job) {:schedule "0 0 1 * * ?"} {})
        (is (= (str (:description translations))
               (str (:description (t2/select-one :model/TransformJob :id (:id job))))))
        (is (= (str (:name translations))
               (str (:name (t2/select-one :model/TransformJob :id (:id job))))))))))

(deftest data-analyst-job-access-follows-the-advanced-permissions-feature-test
  (testing "a data analyst reads, writes and creates transform jobs only while advanced-permissions is available"
    (mt/with-data-analyst-role! (mt/user->id :rasta)
      (mt/with-current-user (mt/user->id :rasta)
        (mt/when-ee-evailable
         (mt/with-premium-features #{:advanced-permissions}
           (is (mi/can-read? (t2/hydrate (t2/select-one :model/TransformJob :id 1) :can_read)))
           (is (mi/can-write? (t2/hydrate (t2/instance :model/TransformJob {}) :can_write)))
           (is (mi/can-create? :model/TransformJob {}))))
        (testing "and none once the feature is gone"
          (mt/with-premium-features #{}
            (is (not (mi/can-read? (t2/hydrate (t2/select-one :model/TransformJob :id 1) :can_read))))
            (is (not (mi/can-write? (t2/hydrate (t2/instance :model/TransformJob {}) :can_write))))
            (is (not (mi/can-create? :model/TransformJob {})))))))
    (testing "a superuser is unaffected"
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-premium-features #{}
          (is (mi/can-read? (t2/hydrate (t2/select-one :model/TransformJob :id 1) :can_read)))
          (is (mi/can-write? (t2/hydrate (t2/instance :model/TransformJob {}) :can_write)))
          (is (mi/can-create? :model/TransformJob {})))))))

(deftest schema-checks-schedule-test
  (is (mr/validate ::transforms.schema/transform-job.schedule "0 0 0 * * ?"))
  (is (not (mr/validate ::transforms.schema/transform-job.schedule "not a cron"))))

(deftest quartz-trigger-follows-job-row-test
  (mt/with-temp-scheduler!
    (mt/with-temp [:model/TransformJob job {:schedule "0 0 0 * * ? *"}]
      (let [job-id           (:id job)
            trigger-schedule #(:schedule (transforms.schedule/existing-trigger job-id))]
        (testing "an inserted job is scheduled"
          (is (= "0 0 0 * * ? *" (trigger-schedule))))
        (testing "a schedule change moves the trigger"
          (transforms.write/update-job! job-id {:schedule "0 0 1 * * ? *"} {})
          (is (= "0 0 1 * * ? *" (trigger-schedule))))
        (testing "deactivating removes the trigger, and activating restores it"
          (transforms.write/update-job! job-id {:active false} {})
          (is (nil? (trigger-schedule)))
          (transforms.write/update-job! job-id {:schedule "0 0 2 * * ? *"} {})
          (is (nil? (trigger-schedule)))
          (transforms.write/update-job! job-id {:active true} {})
          (is (= "0 0 2 * * ? *" (trigger-schedule))))
        (testing "deleting the job removes the trigger"
          (transforms.write/delete-jobs! [job-id] {})
          (is (nil? (trigger-schedule))))))))

(deftest job-update-check-test
  (mt/with-temp [:model/TransformTag tag {}
                 :model/TransformJob job {}]
    (testing "a superuser may update a job and move it to other tags"
      (mt/with-current-user (mt/user->id :crowberto)
        (is (true? (boolean (api/update-check job {:tag_ids [(:id tag)]}))))))
    (testing "a user with no data analyst access may not"
      (mt/with-current-user (mt/user->id :rasta)
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"permissions"
                              (api/update-check job {:name "renamed"})))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"permissions"
                              (api/create-check :model/TransformJob {:tag_ids [(:id tag)]})))))))

(deftest update-job-publishes-update-event-test
  (let [published (atom [])]
    (events/register-owned-consumer! ::job-events
                                     (fn [{:keys [model]}] (when (= :model/TransformJob model) :job))
                                     (fn [_owner events _all] (swap! published into events)))
    (try
      (mt/with-temp-scheduler!
        (mt/with-temp [:model/TransformJob job {:name "Job" :schedule "0 0 0 * * ? *"}]
          (reset! published [])
          (mt/with-test-user :crowberto
            (transforms.write/update-job! (:id job) {:name "Renamed Job"} {}))
          (testing "one update event with the row before and after the update"
            (is (=? [{:operation       :update
                      :id              (:id job)
                      :user-id         (mt/user->id :crowberto)
                      :previous-object {:name "Job" :updated_at (:updated_at job)}
                      :object          {:name "Renamed Job" :updated_at (:updated_at job)}}]
                    @published)))
          (transforms.write/delete-job! (:id job) {})))
      (finally
        (events.tu/unregister! ::job-events)))))

(deftest update-job-query-count-test
  (testing "a warm update-job! of a name issues 3 queries where master's t2/update! with the hooks issued 5"
    (mt/with-temp-scheduler!
      (mt/with-temp [:model/TransformJob {id :id} {:name "Job" :schedule "0 0 0 * * ? *"}]
        (mt/with-test-user :crowberto
          (binding [search.ingestion/*disable-updates* true]
            (transforms.write/update-job! id {:name "Warm Job"} {})
            (t2/with-call-count [call-count]
              (transforms.write/update-job! id {:name "Renamed Job"} {})
              (is (<= (call-count) 3)))))
        (transforms.write/delete-job! id {})))))

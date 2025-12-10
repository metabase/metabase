(ns metabase.indexed-entities.task.index-values-test
  (:require
   [clojure.test :refer :all]
   [metabase.indexed-entities.models.model-index-test :refer [with-scheduler-setup!]]
   [metabase.indexed-entities.task.index-values :as task.index-values]
   [metabase.task.impl :as task]
   [metabase.test :as mt]
   [metabase.util :as u]))

(deftest recreate-missing-triggers-test
  (with-scheduler-setup!
    (mt/dataset test-data
      (testing "Missing triggers are recreated on job-init"
        (let [query     (mt/mbql-query products)
              pk-ref    (mt/$ids $products.id)
              value-ref (mt/$ids $products.title)
              by-key    (fn [k xs]
                          (some (fn [x] (when (= (:key x) k) x)) xs))]
          (mt/with-temp [:model/Card model (assoc (mt/card-with-source-metadata-for-query query)
                                                  :type :model
                                                  :name "model index recreate trigger test")
                         :model/ModelIndex model-index {:model_id   (u/the-id model)
                                                        :pk_ref     pk-ref
                                                        :value_ref  value-ref
                                                        :creator_id (mt/user->id :rasta)
                                                        :schedule   "0 0 23 * * ? *"
                                                        :state      "initial"}]
            (let [trigger-key (format "metabase.task.IndexValues.trigger.%d" (:id model-index))
                  get-trigger #(->> (task/scheduler-info)
                                    :jobs
                                    (by-key "metabase.task.IndexValues.job")
                                    :triggers
                                    (by-key trigger-key))]
              ;; create trigger by calling add-indexing-job
              (task.index-values/add-indexing-job model-index)
              (is (some? (get-trigger)) "Trigger should exist after creating model index")
              ;; delete the trigger from Quartz
              (task.index-values/remove-indexing-job model-index)
              (is (nil? (get-trigger)) "Trigger should be deleted")
              ;; call job-init! to recreate missing triggers
              (#'task.index-values/job-init!)
              (let [recreated-trigger (get-trigger)]
                (is (some? recreated-trigger) "Trigger should be recreated by job-init!")
                (is (= (:schedule model-index) (:schedule recreated-trigger))
                    "Recreated trigger should have correct schedule")
                (is (= {"model-index-id" (:id model-index)} (:data recreated-trigger))
                    "Recreated trigger should have correct data")))))))))

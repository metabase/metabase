(ns metabase-enterprise.transforms.seed-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms.seed :as transforms.seed]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest seed-default-tags-and-jobs-test
  (testing "Seeds default tags and jobs when none exist"
    (mt/with-premium-features #{:transforms}
      ;; Ensure we start with empty tables
      (t2/delete! :transform_job_tags)
      (t2/delete! :transform_job)
      (t2/delete! :transform_tag)

      (transforms.seed/seed-default-tags-and-jobs!)

      (testing "Creates default tags"
        (is (= 4 (t2/count :transform_tag)))
        (doseq [tag-name ["hourly" "daily" "weekly" "monthly"]]
          (is (t2/exists? :transform_tag :name tag-name)
              (str "Default tag '" tag-name "' should exist"))))

      (testing "Creates default jobs"
        (is (= 4 (t2/count :transform_job)))
        (doseq [[job-name entity-id] [["Hourly job" "hourly000000000000000"]
                                      ["Daily job" "daily0000000000000000"]
                                      ["Weekly job" "weekly000000000000000"]
                                      ["Monthly job" "monthly00000000000000"]]]
          (is (t2/exists? :transform_job :entity_id entity-id)
              (str "Default job '" job-name "' with entity_id '" entity-id "' should exist"))))

      (testing "Links jobs to their corresponding tags"
        (is (= 4 (t2/count :transform_job_tags)))
        (doseq [[tag-name entity-id] [["hourly" "hourly000000000000000"]
                                      ["daily" "daily0000000000000000"]
                                      ["weekly" "weekly000000000000000"]
                                      ["monthly" "monthly00000000000000"]]]
          (let [job (t2/select-one :transform_job :entity_id entity-id)
                tag (t2/select-one :transform_tag :name tag-name)]
            (is (t2/exists? :transform_job_tags :job_id (:id job) :tag_id (:id tag))
                (str "Job '" entity-id "' should be associated with tag '" tag-name "'")))))

      (testing "Is idempotent - doesn't create duplicates when run again"
        (transforms.seed/seed-default-tags-and-jobs!)
        (is (= 4 (t2/count :transform_tag)))
        (is (= 4 (t2/count :transform_job)))
        (is (= 4 (t2/count :transform_job_tags)))))))

(deftest seed-partial-data-test
  (testing "Doesn't create anything when data already exists"
    (mt/with-premium-features #{:transforms}
      ;; Ensure we start with empty tables
      (t2/delete! :transform_job_tags)
      (t2/delete! :transform_job)
      (t2/delete! :transform_tag)

      ;; Create only some tags first
      (t2/insert! :transform_tag [{:name "hourly"} {:name "daily"}])

      (transforms.seed/seed-default-tags-and-jobs!)

      (testing "Doesn't create anything when tags already exist"
        (is (= 2 (t2/count :transform_tag)))
        (is (t2/exists? :transform_tag :name "hourly"))
        (is (t2/exists? :transform_tag :name "daily"))
        (is (not (t2/exists? :transform_tag :name "weekly")))
        (is (not (t2/exists? :transform_tag :name "monthly"))))

      (testing "Doesn't create jobs when tags already exist"
        (is (= 0 (t2/count :transform_job)))
        (is (= 0 (t2/count :transform_job_tags))))))

  (testing "Doesn't create anything when jobs already exist"
    (mt/with-premium-features #{:transforms}
      ;; Ensure we start with empty tables
      (t2/delete! :transform_job_tags)
      (t2/delete! :transform_job)
      (t2/delete! :transform_tag)

      ;; Create a job
      (t2/insert! :transform_job [{:name "Test Job"
                                   :schedule "0 0 * * * ? *"
                                   :entity_id "test-job-000000000000"}])

      (transforms.seed/seed-default-tags-and-jobs!)

      (testing "Doesn't create anything when jobs already exist"
        (is (= 0 (t2/count :transform_tag)))
        (is (= 1 (t2/count :transform_job)))
        (is (= 0 (t2/count :transform_job_tags)))))))

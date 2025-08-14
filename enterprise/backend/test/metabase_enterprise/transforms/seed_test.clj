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
      (let [expected-tags (map #(update % :name str) @#'transforms.seed/default-tags)
            expected-jobs (map
                           #(-> %
                                (update :name str)
                                (update :description str)
                                (update :tag_name str))
                           @#'transforms.seed/default-jobs)]
        (testing "Creates default tags"
          (is (= 4 (t2/count :transform_tag)))
          (doseq [{tag-name :name} expected-tags]
            (is (t2/exists? :transform_tag :name tag-name)
                (str "Default tag '" tag-name "' should exist"))))

        (testing "Creates default jobs"
          (is (= 4 (t2/count :transform_job)))
          (doseq [{job-name :name entity-id :entity_id} expected-jobs]
            (is (t2/exists? :transform_job :entity_id entity-id)
                (str "Default job '" job-name "' with entity_id '" entity-id "' should exist"))))

        (testing "Links jobs to their corresponding tags"
          (is (= 4 (t2/count :transform_job_tags)))
          (doseq [{tag-name :tag_name entity-id :entity_id} expected-jobs]
            (let [job (t2/select-one :transform_job :entity_id entity-id)
                  tag (t2/select-one :transform_tag :name tag-name)]
              (is (t2/exists? :transform_job_tags :job_id (:id job) :tag_id (:id tag))
                  (str "Job '" entity-id "' should be associated with tag '" tag-name "'")))))

        (testing "Is idempotent - doesn't create duplicates when run again"
          (transforms.seed/seed-default-tags-and-jobs!)
          (is (= 4 (t2/count :transform_tag)))
          (is (= 4 (t2/count :transform_job)))
          (is (= 4 (t2/count :transform_job_tags))))))))

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

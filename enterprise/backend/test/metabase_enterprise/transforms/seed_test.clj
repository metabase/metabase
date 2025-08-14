(ns metabase-enterprise.transforms.seed-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms.seed :as transforms.seed]
   [metabase-enterprise.transforms.settings :as transforms.settings]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest seed-default-tags-and-jobs-test
  (testing "Seeds default tags and jobs on first run"
    (mt/with-premium-features #{:transforms}
      ;; Reset the seeded flag and clear tables
      (transforms.settings/transforms-seeded! false)
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

        (testing "Setting is marked as true after seeding"
          (is (transforms.settings/transforms-seeded)))

        (testing "Doesn't recreate when run again (respects the setting)"
          (transforms.seed/seed-default-tags-and-jobs!)
          (is (= 4 (t2/count :transform_tag)))
          (is (= 4 (t2/count :transform_job)))
          (is (= 4 (t2/count :transform_job_tags))))))))

(deftest user-deletion-test
  (testing "Doesn't recreate tags/jobs after user deletes them"
    (mt/with-premium-features #{:transforms}
      ;; First seed the defaults
      (transforms.settings/transforms-seeded! false)
      (t2/delete! :transform_job_tags)
      (t2/delete! :transform_job)
      (t2/delete! :transform_tag)

      (transforms.seed/seed-default-tags-and-jobs!)
      (is (transforms.settings/transforms-seeded))
      (is (= 4 (t2/count :transform_tag)))
      (is (= 4 (t2/count :transform_job)))

      ;; User deletes all tags and jobs
      (t2/delete! :transform_job_tags)
      (t2/delete! :transform_job)
      (t2/delete! :transform_tag)

      (testing "After deletion, tables are empty"
        (is (= 0 (t2/count :transform_tag)))
        (is (= 0 (t2/count :transform_job))))

      ;; Try to seed again - should not recreate since we've already seeded once
      (transforms.seed/seed-default-tags-and-jobs!)

      (testing "Doesn't recreate deleted tags and jobs"
        (is (= 0 (t2/count :transform_tag)))
        (is (= 0 (t2/count :transform_job)))
        (is (transforms.settings/transforms-seeded) "Setting should remain true"))))

  (testing "Only seeds on first run, not when setting is already true"
    (mt/with-premium-features #{:transforms}
      ;; Start with setting already true (simulating existing installation)
      (transforms.settings/transforms-seeded! true)
      (t2/delete! :transform_job_tags)
      (t2/delete! :transform_job)
      (t2/delete! :transform_tag)

      (transforms.seed/seed-default-tags-and-jobs!)

      (testing "Doesn't create anything when setting is already true"
        (is (= 0 (t2/count :transform_tag)))
        (is (= 0 (t2/count :transform_job)))
        (is (= 0 (t2/count :transform_job_tags)))))))

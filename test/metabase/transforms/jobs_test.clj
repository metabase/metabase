(ns ^:mb/driver-tests metabase.transforms.jobs-test
  #_{:clj-kondo/ignore [:discouraged-namespace]}
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.tools.logging :as log]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.notification.seed :as notification.seed]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.test :as mt]
   [metabase.test.util.thread-local :as tu.thread-local]
   [metabase.transforms.execute :as transforms.execute]
   [metabase.transforms.jobs :as jobs]
   [metabase.transforms.models.job-run :as transforms.job-run]
   [metabase.transforms.models.transform-run :as transform-run]
   [metabase.transforms.test-dataset :as transforms-dataset]
   [metabase.transforms.test-util :refer [with-transform-cleanup!]]
   [metabase.transforms.util :as transforms.u]
   [toucan2.core :as t2])
  (:import
   (java.util.concurrent CyclicBarrier TimeUnit)))

(set! *warn-on-reflection* true)

(deftest job-transform-ids-test
  (testing "single tag, single transform"
    (mt/with-temp [:model/TransformTag tag {:name "tag-a"}
                   :model/TransformJob job {:name "job-1" :schedule "0 0 * * * ? *"}
                   :model/TransformJobTransformTag _ {:job_id (:id job) :tag_id (:id tag) :position 0}
                   :model/Transform t {:name "t1"}
                   :model/TransformTransformTag _ {:transform_id (:id t) :tag_id (:id tag) :position 0}]
      (is (= #{(:id t)}
             (#'jobs/job-transform-ids (:id job))))))

  (testing "job has 2 tags, transform has only 1 — must still be found"
    (mt/with-temp [:model/TransformTag tag-a {:name "tag-a"}
                   :model/TransformTag tag-b {:name "tag-b"}
                   :model/TransformJob job {:name "job-2" :schedule "0 0 * * * ? *"}
                   :model/TransformJobTransformTag _ {:job_id (:id job) :tag_id (:id tag-a) :position 0}
                   :model/TransformJobTransformTag _ {:job_id (:id job) :tag_id (:id tag-b) :position 1}
                   :model/Transform t {:name "t2"}
                   :model/TransformTransformTag _ {:transform_id (:id t) :tag_id (:id tag-a) :position 0}]
      (is (= #{(:id t)}
             (#'jobs/job-transform-ids (:id job))))))

  (testing "job has 2 tags, two transforms with different tag subsets — both found"
    (mt/with-temp [:model/TransformTag tag-a {:name "tag-a"}
                   :model/TransformTag tag-b {:name "tag-b"}
                   :model/TransformJob job {:name "job-3" :schedule "0 0 * * * ? *"}
                   :model/TransformJobTransformTag _ {:job_id (:id job) :tag_id (:id tag-a) :position 0}
                   :model/TransformJobTransformTag _ {:job_id (:id job) :tag_id (:id tag-b) :position 1}
                   :model/Transform t1 {:name "t3a"}
                   :model/TransformTransformTag _ {:transform_id (:id t1) :tag_id (:id tag-a) :position 0}
                   :model/Transform t2 {:name "t3b"}
                   :model/TransformTransformTag _ {:transform_id (:id t2) :tag_id (:id tag-b) :position 0}]
      (is (= #{(:id t1) (:id t2)}
             (#'jobs/job-transform-ids (:id job))))))

  (testing "job tag with no matching transforms — empty set"
    (mt/with-temp [:model/TransformTag tag {:name "tag-orphan"}
                   :model/TransformJob job {:name "job-4" :schedule "0 0 * * * ? *"}
                   :model/TransformJobTransformTag _ {:job_id (:id job) :tag_id (:id tag) :position 0}]
      (is (= #{} (#'jobs/job-transform-ids (:id job))))))

  (testing "job with no tags — empty set"
    (mt/with-temp [:model/TransformJob job {:name "job-5" :schedule "0 0 * * * ? *"}]
      (is (= #{} (#'jobs/job-transform-ids (:id job)))))))

(deftest run-job-skips-empty-transforms-test
  (testing "run-job! returns nil and creates no job run when there are no transforms to execute"
    (mt/with-temp [:model/TransformTag tag {:name "empty-tag"}
                   :model/TransformJob job {:name "empty-job" :schedule "0 0 * * * ? *"}
                   :model/TransformJobTransformTag _ {:job_id (:id job) :tag_id (:id tag) :position 0}]
      (let [result (jobs/run-job! (:id job) {:run-method :cron})]
        (is (nil? result))
        (is (= 0 (t2/count :model/TransformJobRun :job_id (:id job))))))))

(deftest next-transform-test
  (let [ordering {1 #{2 3}
                  2 #{3 4}
                  3 #{}
                  4 #{5}
                  5 #{}
                  6 #{7 8}
                  7 #{}
                  8 #{}}
        transforms-by-id {1 {:id 1 :created_at #t "2025-01-01T01:01:01"}
                          2 {:id 2 :created_at #t "2025-01-01T01:01:05"}
                          3 {:id 3 :created_at #t "2025-01-01T01:01:04"}
                          4 {:id 4 :created_at #t "2025-01-01T01:01:03"}
                          5 {:id 5 :created_at #t "2025-01-01T01:01:02"}
                          6 {:id 6 :created_at #t "2025-01-01T01:01:06"}
                          7 {:id 7 :created_at #t "2025-01-01T01:01:07"}
                          8 {:id 8 :created_at #t "2025-01-01T01:01:08"}}
        sorted-ordering (#'jobs/sorted-ordering ordering transforms-by-id)]
    (is (= 5
           (-> (#'jobs/next-transform sorted-ordering transforms-by-id #{})
               :id)))
    (is (= 4
           (-> (#'jobs/next-transform sorted-ordering transforms-by-id #{5})
               :id)))
    (is (= 1
           (-> (#'jobs/next-transform sorted-ordering transforms-by-id #{2 3 4 5 6 7 8})
               :id)))
    (is (nil? (#'jobs/next-transform sorted-ordering transforms-by-id #{1 2 3 4 5 6 7 8})))))

(deftest next-transform-same-created-at-test
  (let [ordering {1 #{2 3}
                  2 #{}
                  3 #{}}
        transforms-by-id {1 {:id 1 :created_at #t "2025-01-01T01:01:01"}
                          2 {:id 2 :created_at #t "2025-01-01T01:01:01"}
                          3 {:id 3 :created_at #t "2025-01-01T01:01:01"}}
        sorted-ordering (#'jobs/sorted-ordering ordering transforms-by-id)]
    (is (= 2
           (-> (#'jobs/next-transform sorted-ordering transforms-by-id #{})
               :id)))
    (is (= 3
           (-> (#'jobs/next-transform sorted-ordering transforms-by-id #{2})
               :id)))
    (is (= 1
           (-> (#'jobs/next-transform sorted-ordering transforms-by-id #{2 3})
               :id)))
    (is (nil? (#'jobs/next-transform sorted-ordering transforms-by-id #{1 2 3})))))

(def ^:private query-source {:type "query"})

(deftest run-transform-feature-flag-test
  (testing "Query transforms run without any features"
    (mt/with-premium-features #{}
      (let [query-transform {:id 3
                             :source query-source
                             :name "Test Query Transform"}
            run-id 102
            logged-messages (atom [])
            run-called? (atom false)]
        (mt/with-dynamic-fn-redefs [log/log* (fn [_ level _ message]
                                               (swap! logged-messages conj {:level level :message message}))
                                    transform-run/running-run-for-transform-id (constantly nil)
                                    transforms.execute/execute! (fn [_ _]
                                                                  (reset! run-called? true))
                                    transforms.job-run/add-run-activity! (constantly nil)]
          (#'jobs/run-transform! run-id :scheduled nil query-transform)
          (is (empty? (filter (comp #{:warn} :level) @logged-messages))
              "Should not log warnings when feature is enabled")
          (is @run-called?
              "Should call run-mbql-transform! when feature is enabled")))))
  (testing "Query transforms are skipped when hosted without :transforms-basic feature"
    (mt/with-premium-features #{:hosting}
      (let [query-transform {:id 1
                             :source query-source
                             :name "Test Query Transform"}
            run-id 100
            logged-messages (atom [])]
        (mt/with-dynamic-fn-redefs [log/log* (fn [_ level _ message]
                                               (swap! logged-messages conj {:level level :message message}))
                                    transform-run/running-run-for-transform-id (constantly nil)]
          (#'jobs/run-transform! run-id :scheduled nil query-transform)
          (is (= 1 (count @logged-messages))
              "Should log exactly one warning")
          (is (= :warn (:level (first @logged-messages)))
              "Should log at warn level")
          (is (re-matches #".*Skip running transform 1 due to lacking premium features.*"
                          (:message (first @logged-messages)))
              "Warning message should indicate transform was skipped due to missing features")))))

  (testing "Query transforms run with :transforms-basic feature"
    (mt/with-premium-features #{:hosting :transforms-basic}
      (let [query-transform {:id 3
                             :source query-source
                             :name "Test Query Transform"}
            run-id 102
            logged-messages (atom [])
            run-called? (atom false)]
        (mt/with-dynamic-fn-redefs [log/log* (fn [_ level _ message]
                                               (swap! logged-messages conj {:level level :message message}))
                                    transform-run/running-run-for-transform-id (constantly nil)
                                    transforms.execute/execute! (fn [_ _]
                                                                  (reset! run-called? true))
                                    transforms.job-run/add-run-activity! (constantly nil)]
          (#'jobs/run-transform! run-id :scheduled nil query-transform)
          (is (empty? (filter (comp #{:warn} :level) @logged-messages))
              "Should not log warnings when feature is enabled")
          (is @run-called?
              "Should call run-mbql-transform! when feature is enabled"))))))

(deftest job-run-boom-test
  (mt/with-premium-features #{:transforms-basic}
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/dataset transforms-dataset/transforms-test
        (mt/with-model-cleanup [:model/Notification
                                :model/TransformJobRun]
          (mt/with-fake-inbox
            (notification.seed/seed-notification!)
            (let [mp (mt/metadata-provider)
                  table (t2/select-one :model/Table (mt/id :transforms_products))
                  ;; generate sql for different dbs
                  sql (-> (lib/query mp (lib.metadata/table mp (mt/id :transforms_products)))
                          (lib/with-fields [(lib.metadata/field mp (mt/id :transforms_products :name))])
                          (lib/limit 10)
                          qp.compile/compile
                          :query)]
              (with-transform-cleanup! [target0 {:type "table"
                                                 :schema (:schema table)
                                                 :name "t0"}]
                (mt/with-temp [:model/TransformTag tag {:name "test-tag"}
                               :model/TransformJob job {:name "test-job"
                                                        :schedule "0 0 * * * ? *"}
                               :model/TransformJobTransformTag _ {:job_id (:id job)
                                                                  :tag_id (:id tag)
                                                                  :position 0}
                               ;; independent transform
                               :model/Transform t0 {:name "transform0"
                                                    :source {:type :query
                                                             :query (lib/native-query mp sql)}
                                                    :creator_id (mt/user->id :crowberto)
                                                    :target target0}
                               :model/TransformTransformTag _tag0 {:transform_id (:id t0)
                                                                   :tag_id (:id tag)
                                                                   :position 0}]
                  (let [run-id-atom (atom nil)]
                    (mt/with-dynamic-fn-redefs [jobs/run-transforms! (fn [run-id & _]
                                                                       (reset! run-id-atom run-id)
                                                                       (throw (ex-info "Uncaught error" {})))]
                      (try
                        (jobs/run-job! (:id job) {:run-method :cron})
                        (catch clojure.lang.ExceptionInfo _))
                      (is (some? @run-id-atom))
                      (is (=? {:status :failed
                               :message string?}
                              (t2/select-one :model/TransformJobRun :id @run-id-atom)))
                        ;; crowberto is a superuser/admin, so they receive the notification
                      (is (mt/received-email-subject? :crowberto #"The job .* had failures"))
                      (is (mt/received-email-body? :crowberto #"Uncaught error")))))))))))))

(deftest job-run-boom-manual-no-email-test
  (mt/with-premium-features #{:transforms-basic}
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/dataset transforms-dataset/transforms-test
        (mt/with-model-cleanup [:model/Notification
                                :model/TransformJobRun]
          (mt/with-fake-inbox
            (notification.seed/seed-notification!)
            (let [mp (mt/metadata-provider)
                  table (t2/select-one :model/Table (mt/id :transforms_products))
                  ;; generate sql for different dbs
                  sql (-> (lib/query mp (lib.metadata/table mp (mt/id :transforms_products)))
                          (lib/with-fields [(lib.metadata/field mp (mt/id :transforms_products :name))])
                          (lib/limit 10)
                          qp.compile/compile
                          :query)]
              (with-transform-cleanup! [target0 {:type "table"
                                                 :schema (:schema table)
                                                 :name "t0"}]
                (mt/with-temp [:model/TransformTag tag {:name "test-tag"}
                               :model/TransformJob job {:name "test-job"
                                                        :schedule "0 0 * * * ? *"}
                               :model/TransformJobTransformTag _ {:job_id (:id job)
                                                                  :tag_id (:id tag)
                                                                  :position 0}
                               ;; independent transform
                               :model/Transform t0 {:name "transform0"
                                                    :source {:type :query
                                                             :query (lib/native-query mp sql)}
                                                    :creator_id (mt/user->id :crowberto)
                                                    :target target0}
                               :model/TransformTransformTag _tag0 {:transform_id (:id t0)
                                                                   :tag_id (:id tag)
                                                                   :position 0}]
                  (let [run-id-atom (atom nil)]
                    (mt/with-dynamic-fn-redefs [jobs/run-transforms! (fn [run-id & _]
                                                                       (reset! run-id-atom run-id)
                                                                       (throw (ex-info "Uncaught error" {})))]
                      (try
                        (jobs/run-job! (:id job) {:run-method :manual})
                        (catch clojure.lang.ExceptionInfo _))
                      (is (some? @run-id-atom))
                      (is (=? {:status :failed
                               :message string?}
                              (t2/select-one :model/TransformJobRun :id @run-id-atom)))
                      (is (zero? (count @mt/inbox))))))))))))))

(deftest job-run-with-tranform-run-failure-test
  (mt/with-premium-features #{:transforms-basic}
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/dataset transforms-dataset/transforms-test
        (mt/with-model-cleanup [:model/Notification]
          (mt/with-fake-inbox
            (mt/with-model-cleanup [:model/Notification
                                    :model/TransformJobRun]
              (notification.seed/seed-notification!)
              (let [mp (mt/metadata-provider)
                    table (t2/select-one :model/Table (mt/id :transforms_products))
                    ;; generate sql for different dbs
                    sql (-> (lib/query mp (lib.metadata/table mp (mt/id :transforms_products)))
                            (lib/with-fields [(lib.metadata/field mp (mt/id :transforms_products :name))])
                            (lib/limit 10)
                            qp.compile/compile
                            :query)]
                (with-transform-cleanup! [target0 {:type "table"
                                                   :schema (:schema table)
                                                   :name "t0"}
                                          target1 {:type "table"
                                                   :schema (:schema table)
                                                   :name "t1"}
                                          target2 {:type "table"
                                                   :schema (:schema table)
                                                   :name "t2"}
                                          target3 {:type "table"
                                                   :schema (:schema table)
                                                   :name "t3"}]
                  (mt/with-temp [:model/TransformTag tag {:name "test-tag"}
                                 :model/TransformJob job {:name "test-job"
                                                          :schedule "0 0 * * * ? *"}
                                 :model/TransformJobTransformTag _ {:job_id (:id job)
                                                                    :tag_id (:id tag)
                                                                    :position 0}
                                 ;; independent transform
                                 :model/Transform t0 {:name "transform0"
                                                      :source {:type :query
                                                               :query (lib/native-query mp sql)}
                                                      :creator_id (mt/user->id :crowberto)
                                                      :target target0}
                                 :model/TransformTransformTag _tag0 {:transform_id (:id t0)
                                                                     :tag_id (:id tag)
                                                                     :position 0}
                                 ;; faulty transform
                                 :model/Transform t1 {:name "transform1"
                                                      :source {:type :query
                                                               :query (lib/native-query mp (str/replace sql "name" "bame"))}
                                                      :creator_id (mt/user->id :crowberto)
                                                      :target target1}
                                 :model/TransformTransformTag _tag1 {:transform_id (:id t1)
                                                                     :tag_id (:id tag)
                                                                     :position 0}
                                 ;; depends on faulty transform
                                 :model/Transform t2 {:name "transform2"
                                                      :source {:type :query
                                                               :query (lib/native-query mp (str/replace sql (:name table) (:name target1)))}
                                                      :creator_id (mt/user->id :crowberto)
                                                      :target target2}
                                 :model/TransformTransformTag _tag2 {:transform_id (:id t2)
                                                                     :tag_id (:id tag)
                                                                     :position 0}
                                 ;; independent transform
                                 :model/Transform t3 {:name "transform3"
                                                      :source {:type :query
                                                               :query (lib/native-query mp sql)}
                                                      :creator_id (mt/user->id :crowberto)
                                                      :target target3}
                                 :model/TransformTransformTag _tag3 {:transform_id (:id t3)
                                                                     :tag_id (:id tag)
                                                                     :position 0}]
                    (let [run-id (jobs/run-job! (:id job) {:run-method :cron})]
                      (is (=? [{:status :succeeded}]
                              (t2/select :model/TransformRun :transform_id (:id t0))))
                      (is (=? {:status :failed
                               :message string?}
                              (t2/select-one :model/TransformJobRun :id run-id)))
                      ;; will fail because wrong column name
                      (is (=? [{:status :failed
                                :message string?}]
                              (t2/select :model/TransformRun :transform_id (:id t1))))
                      ;; will not run
                      (is (= []
                             (t2/select :model/TransformRun :transform_id (:id t2))))
                      ;; should still succeed
                      (is (=? [{:status :succeeded}]
                              (t2/select :model/TransformRun :transform_id (:id t3))))
                      (is (= 1 ;; we want to make sure 2 failures send 1 email
                             (count @mt/inbox)))
                      (is (mt/received-email-subject? :crowberto #"The job .* had failures"))
                      (is (mt/received-email-body? :crowberto #"transform1"))
                      (is (mt/received-email-body? :crowberto #"transform2")))))))))))))

(deftest run-mbql-transform-anonymous-user-routing-error-test
  (mt/when-ee-evailable
   (mt/with-premium-features #{:database-routing :transforms-basic}
     (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
       (mt/dataset transforms-dataset/transforms-test
         (mt/with-model-cleanup [:model/Notification]
           (mt/with-fake-inbox
             (mt/with-model-cleanup [:model/Notification
                                     :model/TransformJobRun]
               (notification.seed/seed-notification!)
               (let [mp (mt/metadata-provider)
                     table (t2/select-one :model/Table (mt/id :transforms_products))
                      ;; generate sql for different dbs
                     sql (-> (lib/query mp (lib.metadata/table mp (mt/id :transforms_products)))
                             (lib/with-fields [(lib.metadata/field mp (mt/id :transforms_products :name))])
                             (lib/limit 10)
                             qp.compile/compile
                             :query)]
                 (with-transform-cleanup! [target0 {:type "table"
                                                    :schema (:schema table)
                                                    :name "t0"}]
                   (mt/with-temp [:model/Database _destination {:engine driver/*driver*
                                                                :router_database_id (mt/id)
                                                                :details {:destination_database true}}
                                  :model/DatabaseRouter _ {:database_id (mt/id)
                                                           :user_attribute "db_name"}
                                  :model/TransformTag tag {:name "test-tag"}
                                  :model/TransformJob job {:name "test-job"
                                                           :schedule "0 0 * * * ? *"}
                                  :model/TransformJobTransformTag _ {:job_id (:id job)
                                                                     :tag_id (:id tag)
                                                                     :position 0}
                                   ;; independent transform
                                  :model/Transform t0 {:name "transform0"
                                                       :source {:type :query
                                                                :query (lib/native-query mp sql)}
                                                       :creator_id (mt/user->id :crowberto)
                                                       :target target0}
                                  :model/TransformTransformTag _tag0 {:transform_id (:id t0)
                                                                      :tag_id (:id tag)
                                                                      :position 0}]
                      ;; NOTE: No `with-current-user` wrapper - this simulates running the transform
                      ;; without a user context (e.g., from a cron job or background task).
                      ;; previously this could produce the wrong error message from the QP routing middleware.
                     (try
                       (jobs/run-job! (:id job) {:run-method :cron})
                       (catch Exception _))
                     (is (mt/received-email-subject? :crowberto #"The job .* had failures"))
                     (is (mt/received-email-body? :crowberto #"transform0")))))))))))))

(deftest get-plan-ignores-unrelated-routing-enabled-transforms-test
  (testing "get-plan must not scan unrelated transforms on routing-enabled databases"
    ;; Regression: a transform on a routing-enabled database is unrunnable (by design), but historically
    ;; `get-plan` would fetch *every* transform in the system and call `table-dependencies` on each to
    ;; build a global dependency graph. The routing-enabled transform would throw during that scan,
    ;; taking down the whole scheduler and sending a misleading failure email naming the zombie
    ;; transform — even when no job was asking to run it.
    (mt/with-premium-features #{:database-routing :transforms-basic}
      (let [mp (mt/metadata-provider)]
        (mt/with-temp [:model/Database       _destination {:engine             :h2
                                                           :router_database_id (mt/id)
                                                           :details            {:destination_database true}}
                       :model/DatabaseRouter _            {:database_id    (mt/id)
                                                           :user_attribute "db_name"}
                       ;; Zombie transform on a routing-enabled database, NOT tagged to any job.
                       :model/Transform      _zombie      {:name       "zombie-transform"
                                                           :source     {:type  :query
                                                                        :query (lib/native-query mp "SELECT 1")}
                                                           :creator_id (mt/user->id :crowberto)
                                                           :target     {:type     "table"
                                                                        :database (mt/id)
                                                                        :schema   "PUBLIC"
                                                                        :name     "zombie_out"}}]
          (testing "get-plan with empty transform-ids must not throw on unrelated zombies"
            (is (empty? (:order (#'jobs/get-plan #{}))))))))))

(deftest run-transforms!-race-condition-test
  ;; Previously a race would ensure one transform run got the duplicate key error and aborted.
  ;; Because it is possible to set up transforms to run on overlapping schedules, such races are inevitable.
  ;; On duplicate key error we should go back to the waiting loop until the is_active slot is available.
  (testing "Two concurrent run-transforms! that race on is_active state will both eventually run"
    (mt/with-premium-features #{:transforms-basic}
      (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
        (mt/dataset transforms-dataset/transforms-test
          (let [mp (mt/metadata-provider)
                table (t2/select-one :model/Table (mt/id :transforms_products))
                sql (-> (lib/query mp (lib.metadata/table mp (mt/id :transforms_products)))
                        (lib/with-fields [(lib.metadata/field mp (mt/id :transforms_products :name))])
                        (lib/limit 10)
                        qp.compile/compile
                        :query)]
            (with-transform-cleanup! [target {:type   :table
                                              :schema (:schema table)
                                              :name   "race_test"}]
              (binding [tu.thread-local/*thread-local* false]
                (mt/with-temp [:model/TransformTag tag {:name "race-tag"}
                               :model/TransformJob job {:name "race-job" :schedule "0 0 * * * ? *"}
                               :model/TransformJobTransformTag _ {:job_id (:id job) :tag_id (:id tag) :position 0}
                               :model/Transform transform {:name       "race-transform"
                                                           :source     {:type  :query
                                                                        :query (lib/native-query mp sql)}
                                                           :creator_id (mt/user->id :crowberto)
                                                           :target     target}
                               :model/TransformTransformTag _ {:transform_id (:id transform)
                                                               :tag_id       (:id tag)
                                                               :position     0}]
                  (mt/with-model-cleanup [:model/TransformJobRun :model/TransformRun]
                    (let [barrier-enter   (CyclicBarrier. 2)
                          barrier-exit    (CyclicBarrier. 2)
                          tl-tripped      (ThreadLocal.)
                          await-barrier   (fn [^CyclicBarrier barrier]
                                            (when-not (.get tl-tripped)
                                              (.await barrier 5 TimeUnit/SECONDS)))
                          on-enter        (fn [] (await-barrier barrier-enter))
                          on-exit         (fn [] (await-barrier barrier-exit) (.set tl-tripped true))
                          original-insert transforms.u/try-start-unless-already-running]
                      (mt/with-dynamic-fn-redefs [transforms.u/try-start-unless-already-running
                                                  (fn [transform-id run-method user-id]
                                                    (on-enter)
                                                    (let [[ret ex] (try
                                                                     [(original-insert transform-id run-method user-id)]
                                                                     (catch Throwable t [nil t]))]
                                                      (on-exit)
                                                      (if ex (throw ex) ret)))]
                        (let [run1 (transforms.job-run/start-run! (:id job) :manual)
                              run2 (transforms.job-run/start-run! (:id job) :manual)
                              fut1 (future
                                     (try
                                       {:result (jobs/run-transforms! (:id run1) #{(:id transform)}
                                                                      {:run-method :manual})}
                                       (catch Exception e
                                         {:error e})))
                              fut2 (future
                                     (try
                                       {:result (jobs/run-transforms! (:id run2) #{(:id transform)}
                                                                      {:run-method :manual})}
                                       (catch Exception e
                                         {:error e})))
                              results [(deref fut1 30000 {:error :timeout})
                                       (deref fut2 30000 {:error :timeout})]]
                          (is (every? #(= :succeeded (-> % :result ::jobs/status)) results)
                              "Both threads should succeed"))))))))))))))

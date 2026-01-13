(ns metabase-enterprise.transforms.jobs-test
  #_{:clj-kondo/ignore [:discouraged-namespace]}
  (:require
   [clojure.test :refer :all]
   [clojure.tools.logging :as log]
   [metabase-enterprise.transforms.execute :as transforms.execute]
   [metabase-enterprise.transforms.jobs :as jobs]
   [metabase-enterprise.transforms.models.transform-run :as transform-run]
   [metabase-enterprise.transforms.test-dataset :as transforms-dataset]
   [metabase-enterprise.transforms.test-util :as transforms.tu :refer [with-transform-cleanup! delete-schema!]]
   [metabase.lib.core :as lib]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest basic-deps-test
  (let [ordering {1 #{2 3}
                  2 #{3 4}
                  3 #{}
                  4 #{5}
                  5 #{}
                  6 #{7 8}
                  7 #{}
                  8 #{}}]
    (is (= #{1 2 3 4 5}
           (#'jobs/get-deps ordering [1])))
    (is (= #{1 2 3 4 5 6 7 8}
           (#'jobs/get-deps ordering [1 6])))
    (is (= #{2 3 4 5 6 7 8}
           (#'jobs/get-deps ordering [2 6])))
    (is (= #{1 2 3 4 5}
           (#'jobs/get-deps ordering [1 2 3])))))

(deftest cycle-deps-test
  (let [ordering {1 #{2}
                  2 #{3}
                  3 #{1}}]
    (is (= #{1 2 3}
           (#'jobs/get-deps ordering [1])))))

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
(def ^:private python-source {:type "python"})

(deftest run-transform-feature-flag-test
  (testing "Query transforms are skipped without :transforms feature"
    (mt/with-premium-features #{}
      (let [query-transform {:id 1
                             :source query-source
                             :name "Test Query Transform"}
            run-id 100
            logged-messages (atom [])]
        (with-redefs [log/log* (fn [_ level _ message]
                                 (swap! logged-messages conj {:level level :message message}))
                      transform-run/running-run-for-transform-id (constantly nil)]
          (#'jobs/run-transform! run-id :scheduled query-transform)
          (is (= 1 (count @logged-messages))
              "Should log exactly one warning")
          (is (= :warn (:level (first @logged-messages)))
              "Should log at warn level")
          (is (re-matches #".*Skip running transform 1 due to lacking premium features.*"
                          (:message (first @logged-messages)))
              "Warning message should indicate transform was skipped due to missing features")))))

  (testing "Python transforms are skipped without :transforms-python feature"
    (mt/with-premium-features #{:transforms}
      (let [python-transform {:id 2
                              :source python-source
                              :name "Test Python Transform"}
            run-id 101
            logged-messages (atom [])]
        (with-redefs [log/log* (fn [_ level _ message]
                                 (swap! logged-messages conj {:level level :message message}))
                      transform-run/running-run-for-transform-id (constantly nil)]
          (#'jobs/run-transform! run-id :scheduled python-transform)
          (is (= 1 (count @logged-messages))
              "Should log exactly one warning")
          (is (= :warn (:level (first @logged-messages)))
              "Should log at warn level")
          (is (re-matches #".*Skip running transform 2 due to lacking premium features.*"
                          (:message (first @logged-messages)))
              "Warning message should indicate transform was skipped due to missing features")))))

  (testing "Query transforms run with :transforms feature"
    (mt/with-premium-features #{:transforms}
      (let [query-transform {:id 3
                             :source query-source
                             :name "Test Query Transform"}
            run-id 102
            logged-messages (atom [])
            run-called? (atom false)]
        (with-redefs [log/log* (fn [_ level _ message]
                                 (swap! logged-messages conj {:level level :message message}))
                      transform-run/running-run-for-transform-id (constantly nil)
                      transforms.execute/execute! (fn [_ _]
                                                    (reset! run-called? true))]
          (#'jobs/run-transform! run-id :scheduled query-transform)
          (is (empty? (filter (comp #{:warn} :level) @logged-messages))
              "Should not log warnings when feature is enabled")
          (is @run-called?
              "Should call run-mbql-transform! when feature is enabled"))))))

(deftest execute-test
  (mt/with-premium-features #{:transforms}
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/dataset transforms-dataset/transforms-test
        (let [mp (mt/metadata-provider)
              table (t2/select-one :model/Table (mt/id :transforms_products))]
          (with-transform-cleanup! [target1 {:type   "table"
                                             :schema (:schema table)
                                             :name   "t1"}
                                    target2 {:type   "table"
                                             :schema (:schema table)
                                             :name   "t2"}
                                    target3 {:type   "table"
                                             :schema (:schema table)
                                             :name   "t3"}]
            (mt/with-temp [:model/TransformTag tag {:name "test-tag"}
                           :model/TransformJob job {:name "test-job"
                                                    :schedule "0 0 * * * ? *"}
                           :model/TransformJobTransformTag _ {:job_id (:id job)
                                                              :tag_id (:id tag)
                                                              :position 0}
                           ;; faulty transform
                           :model/Transform t1 {:name   "transform1"
                                                :source {:type  :query
                                                         :query (lib/native-query mp (str "SELECT bame from \"" (:name table) "\";"))}
                                                :target target1}
                           :model/TransformTransformTag _tag1 {:transform_id (:id t1)
                                                               :tag_id (:id tag)
                                                               :position 0}
                           ;; depends on faulty transform
                           :model/Transform t2 {:name   "transform2"
                                                :source {:type  :query
                                                         :query (lib/native-query mp (str "SELECT name from \"" (:name target1) "\";"))}
                                                :target target2}
                           :model/TransformTransformTag _tag2 {:transform_id (:id t2)
                                                               :tag_id (:id tag)
                                                               :position 0}
                           ;; independent transform
                           :model/Transform t3 {:name   "transform1"
                                                :source {:type  :query
                                                         :query (lib/native-query mp (str "SELECT name from " (:name table) ";"))}
                                                :target target3}
                           :model/TransformTransformTag _tag3 {:transform_id (:id t3)
                                                               :tag_id (:id tag)
                                                               :position 0}]
              (let [run-id (jobs/run-job! (:id job) {:run-method :manual})]
                (try
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
                  (finally ;; I don't know why transform_job_run is not cascaded from transform_job
                    (t2/delete! :model/TransformJobRun :id run-id)))))))))))

(ns metabase-enterprise.data-testing.run-api-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defmacro ^:private with-transforms-enabled [& body]
  `(mt/with-premium-features #{:transforms-basic :transforms-testing}
     (mt/with-temporary-raw-setting-values [~'transforms-enabled "true"]
       ~@body)))

(deftest premium-feature-test
  (testing "the endpoint refuses an instance without the feature"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-raw-setting-values [transforms-enabled "true"]
        (mt/assert-has-premium-feature-error
         "Transforms Testing"
         (mt/user-http-request :crowberto :get 402 "ee/data-test-run" :test_type "transform"))))))

(deftest list-runs-test
  (with-transforms-enabled
    (mt/with-temp [:model/Transform    {transform-id :id} {}
                   :model/TransformTest {test-id :id}     {:transform_id transform-id}
                   :model/TransformTest {other-id :id}    {:transform_id transform-id}
                   :model/DataTestRun  {old-id :id}       {:test_type  :transform
                                                           :test_id    test-id
                                                           :status     :passed
                                                           :start_time #t "2026-01-01T10:00:00Z"
                                                           :end_time   #t "2026-01-01T10:00:02Z"}
                   :model/DataTestRun  {failed-id :id}    {:test_type    :transform
                                                           :test_id      test-id
                                                           :initiated_by (mt/user->id :crowberto)
                                                           :status       :failed
                                                           :start_time   #t "2026-02-01T10:00:00Z"
                                                           :end_time     #t "2026-02-01T10:00:02Z"}
                   :model/DataTestRun  {new-id :id}       {:test_type  :transform
                                                           :test_id    test-id
                                                           :status     :passed
                                                           :start_time #t "2026-03-01T10:00:00Z"
                                                           :end_time   #t "2026-03-01T10:00:02Z"}
                   :model/DataTestRun  _                  {:test_type  :transform
                                                           :test_id    other-id
                                                           :status     :error
                                                           :start_time #t "2026-04-01T10:00:00Z"}
                   :model/DataTestRun  _                  {:test_type  :card
                                                           :test_id    test-id
                                                           :status     :error
                                                           :start_time #t "2026-05-01T10:00:00Z"}]
      (let [path "ee/data-test-run"
            get! (fn [& args]
                   (apply mt/user-http-request :crowberto :get 200 path :test_type "transform" :test_id test-id args))]
        (testing "lists the runs of the test, newest first, with who started them and what they ran"
          (is (=? {:data   [{:id new-id :status "passed" :test_type "transform" :test_id test-id :initiated_by_user nil}
                            {:id failed-id :status "failed" :initiated_by_user {:common_name "Crowberto Corv"}}
                            {:id old-id :status "passed"}]
                   :total  3
                   :offset 0}
                  (get!))))
        (testing "pages"
          (is (=? {:data [{:id failed-id}] :total 3 :limit 1 :offset 1}
                  (get! :limit 1 :offset 1))))
        (testing "filters by status"
          (is (=? {:data [{:id failed-id}] :total 1}
                  (get! :statuses "failed"))))
        (testing "filters by start and end time"
          (is (=? {:data [{:id failed-id}] :total 1}
                  (get! :start-time "2026-02-01~2026-02-28")))
          (is (=? {:data [{:id new-id}] :total 1}
                  (get! :end-time "2026-03-01"))))
        (testing "needs a test type"
          (mt/user-http-request :crowberto :get 400 path :test_id test-id))
        (testing "refuses a type that no test has"
          (mt/user-http-request :crowberto :get 400 path :test_type "nonsense"))
        (testing "refuses users who can't read the test"
          (mt/user-http-request :rasta :get 403 path :test_type "transform" :test_id test-id))
        (testing "a test that does not exist is not found"
          (mt/user-http-request :crowberto :get 404 path :test_type "transform" :test_id Integer/MAX_VALUE))))))

(deftest list-unsaved-runs-by-type-test
  (with-transforms-enabled
    (mt/with-temp [:model/Transform    {transform-id :id} {}
                   :model/TransformTest {test-id :id}     {:transform_id transform-id}
                   :model/DataTestRun  {saved-id :id}     {:test_type :transform, :test_id test-id, :status :passed
                                                           :start_time #t "2026-01-01T10:00:00Z"}
                   :model/DataTestRun  {unsaved-id :id}   {:test_type :transform, :test_id nil, :status :failed
                                                           :start_time #t "2026-02-01T10:00:00Z"}
                   :model/DataTestRun  _                  {:test_type :card, :test_id nil, :status :failed
                                                           :start_time #t "2026-03-01T10:00:00Z"}]
      (testing "without a test id, the runs of the type are listed, saved or not"
        (is (=? {:data [{:id unsaved-id :test_id nil} {:id saved-id :test_id test-id}] :total 2}
                (mt/user-http-request :crowberto :get 200 "ee/data-test-run" :test_type "transform"))))
      (testing "without a test id, the caller needs data studio access"
        (mt/user-http-request :rasta :get 403 "ee/data-test-run" :test_type "transform")))))

(deftest runs-outlive-their-test-test
  (with-transforms-enabled
    (mt/with-temp [:model/Transform    {transform-id :id} {}
                   :model/TransformTest {test-id :id}     {:transform_id transform-id}
                   :model/DataTestRun  {run-id :id}       {:test_type :transform, :test_id test-id, :status :passed}]
      (mt/user-http-request :crowberto :delete 204 (str "ee/transform-test/" test-id))
      (testing "the run stays, owned by no test, and is found by type"
        (is (nil? (t2/select-one-fn :test_id :model/DataTestRun :id run-id)))
        (is (contains? (into #{} (map :id)
                             (:data (mt/user-http-request :crowberto :get 200 "ee/data-test-run"
                                                          :test_type "transform" :limit 1000)))
                       run-id))))))

(ns metabase-enterprise.data-testing.run-api-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-testing.test-util :as data-testing.test-util]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; A deftest that lists runs without a test id gives its runs a start date that no other deftest in this namespace
;; uses, and filters the listing on that date, so that the runs of other deftests in the app DB do not match.

(defn- listed-runs
  "The ids and the `total` of the transform test runs that `user` lists with the query parameters `params`."
  [user & params]
  (let [{:keys [data total]} (apply mt/user-http-request user :get 200 "ee/data-test-run" :test-type "transform" params)]
    {:ids (into #{} (map :id) data) :total total}))

(deftest premium-feature-test
  (testing "the endpoint refuses an instance without the feature"
    (data-testing.test-util/with-transforms-enabled #{:transforms-basic}
      (mt/assert-has-premium-feature-error
       "Transforms Testing"
       (mt/user-http-request :crowberto :get 402 "ee/data-test-run" :test-type "transform")))))

(deftest list-runs-test
  (data-testing.test-util/with-transforms-enabled data-testing.test-util/data-analyst-features
    (mt/with-temp [:model/Transform    {transform-id :id} {}
                   ;; created when its oldest run starts: a run is listed when it starts no earlier than its test
                   :model/TransformTest {test-id :id}     {:transform_id transform-id
                                                           :created_at   #t "2026-01-01T10:00:00Z"}
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
                   (apply mt/user-http-request :crowberto :get 200 path :test-type "transform" :test-id test-id args))]
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
          (mt/user-http-request :crowberto :get 400 path :test-id test-id))
        (testing "refuses an unknown test type"
          (mt/user-http-request :crowberto :get 400 path :test-type "nonsense"))
        (testing "refuses users who can't read the test"
          (mt/user-http-request :rasta :get 403 path :test-type "transform" :test-id test-id))
        (testing "a test that does not exist is not found"
          (mt/user-http-request :crowberto :get 404 path :test-type "transform" :test-id Integer/MAX_VALUE))))))

(deftest list-runs-by-type-test
  (data-testing.test-util/with-transforms-enabled data-testing.test-util/data-analyst-features
    (mt/with-temp [:model/Transform    {transform-id :id} {}
                   :model/TransformTest {test-id :id}     {:transform_id transform-id
                                                           :created_at   #t "2000-01-01T00:00:00Z"}
                   :model/DataTestRun  {saved-id :id}     {:test_type :transform, :test_id test-id, :status :passed
                                                           :start_time #t "2001-01-01T10:00:00Z"}
                   :model/DataTestRun  _                  {:test_type :transform, :test_id nil, :status :failed
                                                           :start_time #t "2001-01-01T11:00:00Z"}
                   :model/DataTestRun  _                  {:test_type :card, :test_id test-id, :status :failed
                                                           :start_time #t "2001-01-01T12:00:00Z"}]
      (testing "without a test id, the runs of the tests of the type are listed, and no run of a deleted test"
        (is (= {:ids #{saved-id} :total 1}
               (listed-runs :crowberto :start-time "2001-01-01"))))
      (testing "without a test id, the caller needs data studio access"
        (mt/user-http-request :rasta :get 403 "ee/data-test-run" :test-type "transform")))))

(deftest runs-outlive-their-test-test
  (data-testing.test-util/with-transforms-enabled data-testing.test-util/data-analyst-features
    (mt/with-temp [:model/Transform    {transform-id :id} {}
                   :model/TransformTest {test-id :id}     {:transform_id transform-id
                                                           :created_at   #t "2000-01-01T00:00:00Z"}
                   :model/DataTestRun  {run-id :id}       {:test_type :transform, :test_id test-id, :status :passed
                                                           :start_time #t "2001-01-02T10:00:00Z"}]
      (testing "the run of a test is listed"
        (is (= {:ids #{run-id} :total 1}
               (listed-runs :crowberto :start-time "2001-01-02"))))
      (mt/user-http-request :crowberto :delete 204 (str "ee/transform-test/" test-id))
      (testing "after the test is deleted, the run stays, owned by no test, and is no longer listed"
        (is (t2/exists? :model/DataTestRun :id run-id))
        (is (nil? (t2/select-one-fn :test_id :model/DataTestRun :id run-id)))
        (is (= {:ids #{} :total 0}
               (listed-runs :crowberto :start-time "2001-01-02")))))))

(deftest list-runs-only-of-readable-tests-test
  (data-testing.test-util/with-transforms-enabled data-testing.test-util/data-analyst-features
    (mt/with-temp [:model/Transform    {transform-id :id} (data-testing.test-util/id-transform :people)
                   :model/TransformTest {test-id :id}     {:transform_id transform-id
                                                           :created_at   #t "2000-01-01T00:00:00Z"}
                   :model/DataTestRun  {run-id :id}       {:test_type :transform, :test_id test-id, :status :passed
                                                           :start_time #t "2001-01-03T10:00:00Z"}]
      (mt/with-data-analyst-role! (mt/user->id :lucky)
        (testing "a data analyst who can read the transform sees the runs of its test"
          (mt/with-db-perms-for-group! (perms-group/all-users) (mt/id) {:perms/transforms     :no
                                                                        :perms/create-queries :query-builder}
            (is (= {:ids #{run-id} :total 1}
                   (listed-runs :lucky :start-time "2001-01-03")))))
        (testing "a data analyst who cannot read the transform sees no run of its test"
          (mt/with-db-perms-for-group! (perms-group/all-users) (mt/id) {:perms/transforms     :no
                                                                        :perms/view-data      :blocked
                                                                        :perms/create-queries :no}
            (is (= {:ids #{} :total 0}
                   (listed-runs :lucky :start-time "2001-01-03")))
            (testing "and cannot ask for them by test id"
              (mt/user-http-request :lucky :get 403 "ee/data-test-run"
                                    :test-type "transform" :test-id test-id))))))))

(deftest reused-test-id-lists-only-its-own-runs-test
  (data-testing.test-util/with-transforms-enabled data-testing.test-util/data-analyst-features
    (mt/with-temp [:model/Transform    {hidden-transform :id} (data-testing.test-util/id-transform :people)
                   :model/Transform    {open-transform :id}   (data-testing.test-util/id-transform :venues)
                   :model/TransformTest {old-test-id :id}     {:transform_id hidden-transform
                                                               :created_at   #t "2000-01-01T00:00:00Z"}
                   ;; An explicit start time before the reused test's creation. A default start time is the
                   ;; transaction's now(), which on Postgres equals the default creation time of a test made in the same
                   ;; transaction, and the guard lists a run that starts when its test is created.
                   :model/DataTestRun  {run-id :id}           {:test_type    :transform
                                                               :test_id      old-test-id
                                                               :status       :failed
                                                               :initiated_by (mt/user->id :crowberto)
                                                               :start_time   #t "2001-01-04T10:00:00Z"}]
      (mt/with-data-analyst-role! (mt/user->id :lucky)
        (mt/with-db-perms-for-group! (perms-group/all-users) (mt/id) {:perms/transforms     :no
                                                                      :perms/view-data      :unrestricted
                                                                      :perms/create-queries :query-builder}
          (mt/with-perm-for-group-and-table! (perms-group/all-users) (mt/id :people) :perms/create-queries :no
            (testing "a data analyst who cannot read a test cannot list its runs"
              (mt/user-http-request :lucky :get 403 "ee/data-test-run" :test-type "transform" :test-id old-test-id))
            (t2/delete! :transform_test :id old-test-id)
            (testing "a test row deleted without the model leaves its id on the run"
              (is (= old-test-id (t2/select-one-fn :test_id :model/DataTestRun :id run-id))))
            (t2/insert! :transform_test {:id           old-test-id
                                         :transform_id open-transform
                                         :name         "reused id"
                                         :entity_id    "reused_test_id_entity"
                                         :inputs       "[]"
                                         :expectations "[]"
                                         :creator_id   (mt/user->id :lucky)
                                         :created_at   #t "2001-01-04T11:00:00Z"
                                         :updated_at   #t "2001-01-04T11:00:00Z"})
            (try
              (testing "the data analyst can read the test that has the reused id"
                (mt/user-http-request :lucky :get 200 (str "ee/transform-test/" old-test-id)))
              (testing "a test with a reused id does not list the runs of the deleted test"
                (is (not (contains? (:ids (listed-runs :lucky :test-id old-test-id)) run-id))))
              (testing "a test with a reused id has no last run from the deleted test"
                (is (nil? (get-in (mt/user-http-request :lucky :get 200 (str "ee/transform-test/" old-test-id))
                                  [:last_run :id]))))
              (finally
                (t2/delete! :model/TransformTest :id old-test-id)))))))))

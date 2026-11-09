(ns metabase-enterprise.data-testing.run-api-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defmacro ^:private with-transforms-enabled [& body]
  ;; advanced-permissions: the Data Analyst role only opens Data Studio while the plan includes it
  `(mt/with-premium-features #{:advanced-permissions :transforms-basic :transforms-testing}
     (mt/with-temporary-raw-setting-values [~'transforms-enabled "true"]
       ~@body)))

(deftest premium-feature-test
  (testing "the endpoint refuses an instance without the feature"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-raw-setting-values [transforms-enabled "true"]
        (mt/assert-has-premium-feature-error
         "Transforms Testing"
         (mt/user-http-request :crowberto :get 402 "ee/data-test-run" :test-type "transform"))))))

(deftest list-runs-test
  (with-transforms-enabled
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
        (testing "refuses a type that no test has"
          (mt/user-http-request :crowberto :get 400 path :test-type "nonsense"))
        (testing "refuses users who can't read the test"
          (mt/user-http-request :rasta :get 403 path :test-type "transform" :test-id test-id))
        (testing "a test that does not exist is not found"
          (mt/user-http-request :crowberto :get 404 path :test-type "transform" :test-id Integer/MAX_VALUE))))))

(deftest list-runs-by-type-test
  (with-transforms-enabled
    (mt/with-temp [:model/Transform    {transform-id :id} {}
                   :model/TransformTest {test-id :id}     {:transform_id transform-id
                                                           :created_at   #t "2025-01-01T00:00:00Z"}
                   :model/DataTestRun  {saved-id :id}     {:test_type :transform, :test_id test-id, :status :passed
                                                           :start_time #t "2026-01-01T10:00:00Z"}
                   :model/DataTestRun  {unsaved-id :id}   {:test_type :transform, :test_id nil, :status :failed
                                                           :start_time #t "2026-02-01T10:00:00Z"}
                   :model/DataTestRun  _                  {:test_type :card, :test_id nil, :status :failed
                                                           :start_time #t "2026-03-01T10:00:00Z"}]
      (testing "without a test id, the runs of the saved tests of the type are listed, and no run of an unsaved test"
        (let [{:keys [data total]} (mt/user-http-request :crowberto :get 200 "ee/data-test-run"
                                                         :test-type "transform" :limit 1000)
              ids                  (into #{} (map :id) data)]
          (is (contains? ids saved-id))
          (is (not (contains? ids unsaved-id)))
          (is (every? :test_id data))
          (is (= (count data) total))))
      (testing "without a test id, the caller needs data studio access"
        (mt/user-http-request :rasta :get 403 "ee/data-test-run" :test-type "transform")))))

(deftest runs-outlive-their-test-test
  (with-transforms-enabled
    (mt/with-temp [:model/Transform    {transform-id :id} {}
                   :model/TransformTest {test-id :id}     {:transform_id transform-id}
                   :model/DataTestRun  {run-id :id}       {:test_type :transform, :test_id test-id, :status :passed}]
      (mt/user-http-request :crowberto :delete 204 (str "ee/transform-test/" test-id))
      (testing "the run stays, owned by no test, and is no longer listed"
        (is (nil? (t2/select-one-fn :test_id :model/DataTestRun :id run-id)))
        (is (not (contains? (into #{} (map :id)
                                  (:data (mt/user-http-request :crowberto :get 200 "ee/data-test-run"
                                                               :test-type "transform" :limit 1000)))
                            run-id)))))))

(deftest list-runs-only-of-readable-tests-test
  (with-transforms-enabled
    (let [mp (mt/metadata-provider)]
      (mt/with-temp [:model/Transform    {transform-id :id} {:source {:type  :query
                                                                      :query (-> (lib/query mp (lib.metadata/table mp (mt/id :people)))
                                                                                 (lib/with-fields [(lib.metadata/field mp (mt/id :people :id))]))}
                                                             :target {:type     "table"
                                                                      :schema   "PUBLIC"
                                                                      :name     "PEOPLE_SUMMARY"
                                                                      :database (mt/id)}}
                     :model/TransformTest {test-id :id}     {:transform_id transform-id}
                     :model/DataTestRun  {run-id :id}       {:test_type :transform, :test_id test-id, :status :passed}]
        (let [listed? (fn []
                        (contains? (into #{} (map :id)
                                         (:data (mt/user-http-request :lucky :get 200 "ee/data-test-run"
                                                                      :test-type "transform" :limit 1000)))
                                   run-id))]
          (mt/with-data-analyst-role! (mt/user->id :lucky)
            (testing "a data analyst who can read the transform sees the runs of its test"
              (mt/with-db-perms-for-group! (perms-group/all-users) (mt/id) {:perms/transforms     :no
                                                                            :perms/create-queries :query-builder}
                (is (listed?))))
            (testing "a data analyst who cannot read the transform sees no run of its test"
              (mt/with-db-perms-for-group! (perms-group/all-users) (mt/id) {:perms/transforms     :no
                                                                            :perms/view-data      :blocked
                                                                            :perms/create-queries :no}
                (is (not (listed?)))
                (testing "and cannot ask for them by test id"
                  (mt/user-http-request :lucky :get 403 "ee/data-test-run"
                                        :test-type "transform" :test-id test-id))))))))))

(defn- table-transform [table]
  (let [mp (mt/metadata-provider)]
    {:source {:type  :query
              :query (-> (lib/query mp (lib.metadata/table mp (mt/id table)))
                         (lib/with-fields [(lib.metadata/field mp (mt/id table :id))]))}
     :target {:type     "table"
              :schema   "PUBLIC"
              :name     (str (name table) "_SUMMARY")
              :database (mt/id)}}))

(deftest reused-test-id-lists-only-its-own-runs-test
  (with-transforms-enabled
    (mt/with-temp [:model/Transform    {hidden-transform :id} (table-transform :people)
                   :model/Transform    {open-transform :id}   (table-transform :venues)
                   :model/TransformTest {old-test-id :id}     {:transform_id hidden-transform}
                   :model/DataTestRun  {run-id :id}           {:test_type    :transform
                                                               :test_id      old-test-id
                                                               :status       :failed
                                                               :initiated_by (mt/user->id :crowberto)}]
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
                                         :created_at   (java.time.OffsetDateTime/now)
                                         :updated_at   (java.time.OffsetDateTime/now)})
            (try
              (testing "the data analyst can read the test that has the reused id"
                (mt/user-http-request :lucky :get 200 (str "ee/transform-test/" old-test-id)))
              (testing "a test with a reused id does not list the runs of the deleted test"
                (is (not (contains? (into #{} (map :id)
                                          (:data (mt/user-http-request :lucky :get 200 "ee/data-test-run"
                                                                       :test-type "transform" :test-id old-test-id)))
                                    run-id))))
              (testing "a test with a reused id has no last run from the deleted test"
                (is (nil? (get-in (mt/user-http-request :lucky :get 200 (str "ee/transform-test/" old-test-id))
                                  [:last_run :id]))))
              (finally
                (t2/delete! :model/TransformTest :id old-test-id)))))))))

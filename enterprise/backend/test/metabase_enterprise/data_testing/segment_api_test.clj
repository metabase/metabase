(ns metabase-enterprise.data-testing.segment-api-test
  "`/api/ee/segment-test`."
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase-enterprise.data-testing.run-tracking :as data-testing.run-tracking]
   [metabase-enterprise.data-testing.test-util :as data-testing.test-util]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.permissions.test-util :as perms.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(def ^:private inputs
  [{:table   {:schema "PUBLIC" :name "PEOPLE"}
    :format  "rows"
    :columns [{:name "ID" :cast_type "INTEGER"} {:name "SOURCE" :cast_type "VARCHAR"}]
    :rows    [{"ID" 1 "SOURCE" "Google"} {"ID" 2 "SOURCE" "Twitter"}]}])

(def ^:private expectations
  [{:type "empty" :name "only people from Google" :sql "SELECT * FROM {{output}} WHERE SOURCE <> 'Google'"}])

(defn- body
  [segment-id]
  {:segment_id segment-id :name "My test" :inputs inputs :expectations expectations})

(deftest premium-feature-test
  (testing "every endpoint refuses an instance without the feature"
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Segment     {segment-id :id} (data-testing.test-util/from-google-segment)
                     :model/SegmentTest {test-id :id}    {:segment_id segment-id}]
        (let [path (str "ee/segment-test/" test-id)]
          (doseq [request [[:get 402 "ee/segment-test"]
                           [:post 402 "ee/segment-test" (body segment-id)]
                           [:get 402 path]
                           [:put 402 path {:name "t"}]
                           [:delete 402 path]
                           [:post 402 (str path "/run")]]]
            (mt/assert-has-premium-feature-error
             "Transforms Testing"
             (apply mt/user-http-request :crowberto request))))))))

(deftest crud-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-temp [:model/Segment {segment-id :id} (data-testing.test-util/from-google-segment)
                   :model/Segment {other-id :id}   (data-testing.test-util/from-google-segment)]
      (let [created (mt/user-http-request :crowberto :post 200 "ee/segment-test" (assoc (body segment-id) :description "abc"))
            path    (str "ee/segment-test/" (:id created))]
        (try
          (testing "POST creates the test as the current user"
            (is (=? {:id           pos-int?
                     :entity_id    string?
                     :segment_id   segment-id
                     :creator_id   (mt/user->id :crowberto)
                     :name         "My test"
                     :description  "abc"
                     :inputs       [{:format "rows" :rows [{:ID 1 :SOURCE "Google"} {:ID 2 :SOURCE "Twitter"}]}]
                     :expectations expectations}
                    created)))
          (testing "GET returns the test with its newest run and whether the user may run it"
            (is (= (assoc created :last_run nil :can_run true) (mt/user-http-request :crowberto :get 200 path))))
          (testing "GET / filters by segment"
            (is (= [(:id created)]
                   (map :id (mt/user-http-request :crowberto :get 200 "ee/segment-test" :segment-id segment-id))))
            (is (= [] (mt/user-http-request :crowberto :get 200 "ee/segment-test" :segment-id other-id)))
            (is (some #{(:id created)} (map :id (mt/user-http-request :crowberto :get 200 "ee/segment-test")))))
          (testing "PUT changes only the given keys"
            (is (=? {:name "Renamed" :description "abc" :segment_id other-id}
                    (mt/user-http-request :crowberto :put 200 path {:name "Renamed" :segment_id other-id}))))
          (testing "DELETE removes the test"
            (mt/user-http-request :crowberto :delete 204 path)
            (is (not (t2/exists? :model/SegmentTest :id (:id created))))
            (mt/user-http-request :crowberto :get 404 path))
          (finally
            (t2/delete! :model/SegmentTest :id (:id created))))))))

(defn- segment-tests-state
  "The id, name and segment of every SegmentTest, to compare before and after a refused request."
  []
  (t2/select-fn-set (juxt :id :name :segment_id) :model/SegmentTest))

(deftest a-test-of-a-missing-segment-is-refused-as-forbidden-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-temp [:model/Segment     {segment-id :id} (data-testing.test-util/from-google-segment)
                   :model/Segment     {other-id :id}   (data-testing.test-util/from-google-segment)
                   :model/SegmentTest {test-id :id}    {:segment_id segment-id :inputs inputs :expectations expectations}]
      (let [missing-id (inc (t2/select-one-fn :max-id [:model/Segment [:%max.id :max-id]]))
            before     (segment-tests-state)]
        (testing "even for an admin, the permission check refuses a segment that does not exist"
          (mt/user-http-request :crowberto :post 403 "ee/segment-test" (body missing-id))
          (mt/user-http-request :crowberto :put 403 (str "ee/segment-test/" test-id) {:segment_id missing-id}))
        (testing "the refused requests created and changed no test"
          (is (= before (segment-tests-state))))
        (testing "control: moving the test to another existing segment succeeds"
          (is (=? {:segment_id other-id}
                  (mt/user-http-request :crowberto :put 200 (str "ee/segment-test/" test-id) {:segment_id other-id}))))))))

(deftest write-endpoints-refuse-a-test-that-could-not-run-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-temp [:model/Segment     {segment-id :id} (data-testing.test-util/from-google-segment)
                   :model/SegmentTest {test-id :id}    {:segment_id segment-id :inputs inputs :expectations expectations}]
      (testing "POST refuses a test missing an input, under the segment-test error prefix"
        (let [response (mt/user-http-request :crowberto :post 400 "ee/segment-test" (assoc (body segment-id) :inputs []))]
          (is (= "segment-test.missing-inputs" (:error-code response)))
          (is (= ["PUBLIC.PEOPLE"] (:tables response)))))
      (testing "POST refuses a test with no expectations"
        (is (= "segment-test.no-expectations"
               (:error-code (mt/user-http-request :crowberto :post 400 "ee/segment-test"
                                                  (assoc (body segment-id) :expectations []))))))
      (testing "PUT refuses a change that makes the test unrunnable, and keeps the test"
        (is (= "segment-test.missing-inputs"
               (:error-code (mt/user-http-request :crowberto :put 400 (str "ee/segment-test/" test-id) {:inputs []}))))
        (is (= 1 (count (:inputs (t2/select-one :model/SegmentTest :id test-id)))))))))

(deftest run-saved-test-test
  (mt/with-premium-features #{:transforms-testing}
    ;; A run counts as the test's run only if it started after the test was created. The with-temp default for
    ;; `created_at` is the JVM's clock and the run's start time is the app DB's, so the test is dated in the past.
    (mt/with-temp [:model/Segment     {segment-id :id} (data-testing.test-util/from-google-segment)
                   :model/SegmentTest {test-id :id}    {:segment_id   segment-id
                                                        :inputs       inputs
                                                        :expectations expectations
                                                        :created_at   #t "2025-01-01T00:00:00Z"}]
      (let [path (str "ee/segment-test/" test-id)]
        (try
          (testing "a run reports each expectation"
            (is (=? {:status       "passed"
                     :expectations [{:name "only people from Google" :status "passed"}]}
                    (mt/user-http-request :crowberto :post 200 (str path "/run")))))
          (testing "the run is the test's newest run, and is in the run history of the test"
            (let [{:keys [last_run]} (mt/user-http-request :crowberto :get 200 path)]
              (is (=? {:test_type "segment" :test_id test-id :status "passed"} last_run))
              (is (= [(:id last_run)]
                     (map :id (:data (mt/user-http-request :crowberto :get 200 "ee/data-test-run"
                                                           :test-type "segment" :test-id test-id)))))))
          (testing "a run refused by the runner publishes the segment-test prefix"
            (t2/update! :model/SegmentTest :id test-id {:inputs []})
            (is (= "segment-test.missing-inputs"
                   (:error-code (mt/user-http-request :crowberto :post 400 (str path "/run"))))))
          (finally
            (t2/delete! :model/DataTestRun :test_type "segment" :test_id test-id)))))))

(deftest list-needs-data-studio-access-test
  (mt/with-premium-features data-testing.test-util/data-analyst-features
    (perms.tu/with-no-data-perms-for-all-users!
      (mt/with-db-perms-for-group! (perms-group/all-users) (mt/id) {:perms/view-data      :unrestricted
                                                                    :perms/create-queries :query-builder}
        (mt/with-temp [:model/Segment     {segment-id :id} (data-testing.test-util/from-google-segment)
                       :model/SegmentTest {test-id :id}    {:segment_id segment-id}]
          (testing "a user who can read the segment but not enter Data Studio cannot list segment tests"
            (is (= test-id (:id (mt/user-http-request :rasta :get 200 (str "ee/segment-test/" test-id)))))
            (mt/user-http-request :rasta :get 403 "ee/segment-test"))
          (mt/with-data-analyst-role! (mt/user->id :lucky)
            (testing "a user who can enter Data Studio lists the tests of the segments they can read"
              (is (contains? (set (map :id (mt/user-http-request :lucky :get 200 "ee/segment-test"))) test-id)))))))))

(deftest run-history-without-a-test-id-lists-segment-test-runs-test
  (mt/with-premium-features data-testing.test-util/data-analyst-features
    (perms.tu/with-no-data-perms-for-all-users!
      (mt/with-db-perms-for-group! (perms-group/all-users) (mt/id) {:perms/view-data      :unrestricted
                                                                    :perms/create-queries :query-builder}
        ;; A run is listed only if it started after its test was created; see `run-saved-test-test`.
        (mt/with-temp [:model/Segment     {segment-id :id} (data-testing.test-util/from-google-segment)
                       :model/SegmentTest {test-id :id}    {:segment_id segment-id :created_at #t "2025-01-01T00:00:00Z"}]
          (let [{run-id :id} (data-testing.run-tracking/start-run! :segment test-id)
                listed       (fn [user & params]
                               (set (map :id (:data (apply mt/user-http-request user :get 200 "ee/data-test-run"
                                                           :test-type "segment" params)))))]
            (try
              (data-testing.run-tracking/finish-run! run-id :passed)
              (mt/with-data-analyst-role! (mt/user->id :lucky)
                (testing "control: with the test id, the run is listed"
                  (is (= #{run-id} (listed :lucky :test-id test-id))))
                (testing "without a test id, a data analyst who may read the test sees its run"
                  (is (contains? (listed :lucky) run-id))))
              (testing "without a test id, a user who may read the test but not enter Data Studio is refused"
                (is (= #{run-id} (listed :rasta :test-id test-id)))
                (mt/user-http-request :rasta :get 403 "ee/data-test-run" :test-type "segment"))
              (finally
                (t2/delete! :model/DataTestRun :id run-id)))))))))

(deftest permissions-test
  (mt/with-premium-features data-testing.test-util/data-analyst-features
    (perms.tu/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/Segment     {segment-id :id} (data-testing.test-util/from-google-segment)
                     :model/SegmentTest {test-id :id}    {:segment_id   segment-id
                                                          :inputs       inputs
                                                          :expectations expectations}]
        (let [path (str "ee/segment-test/" test-id)]
          (try
            (mt/with-db-perms-for-group! (perms-group/all-users) (mt/id) {:perms/view-data      :blocked
                                                                          :perms/create-queries :no}
              (testing "no access to the segment's table: 403 on get and on run"
                (mt/user-http-request :rasta :get 403 path)
                (mt/user-http-request :rasta :post 403 (str path "/run"))))
            (mt/with-db-perms-for-group! (perms-group/all-users) (mt/id) {:perms/view-data      :unrestricted
                                                                          :perms/create-queries :query-builder-and-native}
              (testing "a user who may read the segment: get and run, but not create, update or delete"
                (is (= test-id (:id (mt/user-http-request :rasta :get 200 path))))
                (is (= "passed" (:status (mt/user-http-request :rasta :post 200 (str path "/run")))))
                (let [before (segment-tests-state)]
                  (mt/user-http-request :rasta :post 403 "ee/segment-test" (body segment-id))
                  (mt/user-http-request :rasta :put 403 path {:name "nope"})
                  (mt/user-http-request :rasta :delete 403 path)
                  (testing "and the refused requests created, changed and deleted no test"
                    (is (= before (segment-tests-state))))))
              (mt/with-data-analyst-role! (mt/user->id :lucky)
                (testing "a data analyst who may edit the segment and write native queries: create and update"
                  (let [created (mt/user-http-request :lucky :post 200 "ee/segment-test" (body segment-id))]
                    (t2/delete! :model/SegmentTest :id (:id created)))
                  (is (=? {:name "renamed"} (mt/user-http-request :lucky :put 200 path {:name "renamed"}))))))
            (mt/with-db-perms-for-group! (perms-group/all-users) (mt/id) {:perms/view-data      :unrestricted
                                                                          :perms/create-queries :query-builder}
              (mt/with-data-analyst-role! (mt/user->id :lucky)
                (testing "no native queries on the segment's database: 403 on create and on run"
                  (let [before (segment-tests-state)]
                    (mt/user-http-request :lucky :post 403 "ee/segment-test" (body segment-id))
                    (is (= before (segment-tests-state))))
                  (mt/user-http-request :lucky :post 403 (str path "/run"))
                  (is (= test-id (:id (mt/user-http-request :lucky :get 200 path)))))))
            (finally
              (t2/delete! :model/DataTestRun :test_type "segment" :test_id test-id))))))))

(defn- can-run-flags
  "The `can_run` of the segment test `test-id` as `user` gets it, and as `user` lists it among the tests of
  `segment-id`."
  [user segment-id test-id]
  {:get  (:can_run (mt/user-http-request user :get 200 (str "ee/segment-test/" test-id)))
   :list (:can_run (m/find-first #(= test-id (:id %))
                                 (mt/user-http-request user :get 200 "ee/segment-test" :segment-id segment-id)))})

(deftest can-run-says-whether-the-run-endpoint-accepts-the-user-test
  (mt/with-premium-features data-testing.test-util/data-analyst-features
    (perms.tu/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/Segment     {segment-id :id} (data-testing.test-util/from-google-segment)
                     :model/SegmentTest {test-id :id}    {:segment_id   segment-id
                                                          :inputs       inputs
                                                          :expectations expectations}
                     :model/SegmentTest _                {:segment_id   segment-id
                                                          :inputs       inputs
                                                          :expectations expectations}]
        (try
          (mt/with-data-analyst-role! (mt/user->id :lucky)
            (mt/with-db-perms-for-group! (perms-group/all-users) (mt/id) {:perms/view-data      :unrestricted
                                                                          :perms/create-queries :query-builder-and-native}
              (testing "a user who may read the segment and write native queries: true, and the run is accepted"
                (is (= {:get true :list true} (can-run-flags :lucky segment-id test-id)))
                (is (= [true true] (map :can_run (mt/user-http-request :lucky :get 200 "ee/segment-test"
                                                                       :segment-id segment-id))))
                (mt/user-http-request :lucky :post 200 (str "ee/segment-test/" test-id "/run"))))
            (mt/with-db-perms-for-group! (perms-group/all-users) (mt/id) {:perms/view-data      :unrestricted
                                                                          :perms/create-queries :query-builder}
              (testing "a user who may not write native queries on the segment's database: false, and the run is refused"
                (is (= {:get false :list false} (can-run-flags :lucky segment-id test-id)))
                (mt/user-http-request :lucky :post 403 (str "ee/segment-test/" test-id "/run")))))
          (finally
            (t2/delete! :model/DataTestRun :test_type "segment" :test_id test-id)))))))

(deftest can-run-of-a-list-loads-the-segments-at-once-test
  (mt/with-premium-features data-testing.test-util/data-analyst-features
    (mt/with-temp [:model/Segment     {segment-id :id} (data-testing.test-util/from-google-segment)
                   :model/SegmentTest test-1           {:segment_id segment-id}
                   :model/SegmentTest test-2           {:segment_id segment-id}
                   :model/SegmentTest test-3           {:segment_id segment-id}]
      (mt/with-test-user :rasta
        (let [calls (fn [segment-tests]
                      (t2/with-call-count [call-count]
                        (doall (t2/hydrate segment-tests :can_run))
                        (call-count)))]
          (calls [test-1])
          (is (= (calls [test-1]) (calls [test-1 test-2 test-3]))))))))

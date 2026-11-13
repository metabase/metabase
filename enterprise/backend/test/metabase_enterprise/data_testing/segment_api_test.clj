(ns metabase-enterprise.data-testing.segment-api-test
  "`/api/ee/segment-test`."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-testing.test-util :as data-testing.test-util]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
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

(defn- segment
  "Segment columns for the segment of the people whose source is Google."
  []
  (let [mp (mt/metadata-provider)]
    {:name       "From Google"
     :table_id   (mt/id :people)
     :definition (-> (lib/query mp (lib.metadata/table mp (mt/id :people)))
                     (lib/filter (lib/= (lib.metadata/field mp (mt/id :people :source)) "Google")))}))

(defn- body
  [segment-id]
  {:segment_id segment-id :name "My test" :inputs inputs :expectations expectations})

(deftest premium-feature-test
  (testing "every endpoint refuses an instance without the feature"
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Segment     {segment-id :id} (segment)
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
    (mt/with-temp [:model/Segment {segment-id :id} (segment)
                   :model/Segment {other-id :id}   (segment)]
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
          (testing "GET returns the test with its newest run"
            (is (= (assoc created :last_run nil) (mt/user-http-request :crowberto :get 200 path))))
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

(deftest a-test-of-a-missing-segment-is-refused-as-forbidden-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-temp [:model/Segment     {segment-id :id} (segment)
                   :model/SegmentTest {test-id :id}    {:segment_id segment-id :inputs inputs :expectations expectations}]
      (let [missing-id (inc (t2/select-one-fn :max-id [:model/Segment [:%max.id :max-id]]))]
        (testing "even for an admin, the permission check refuses a segment that does not exist"
          (mt/user-http-request :crowberto :post 403 "ee/segment-test" (body missing-id))
          (mt/user-http-request :crowberto :put 403 (str "ee/segment-test/" test-id) {:segment_id missing-id}))
        (testing "control: the same requests on the existing segment succeed"
          (mt/user-http-request :crowberto :put 200 (str "ee/segment-test/" test-id) {:segment_id segment-id}))))))

(deftest write-endpoints-refuse-a-test-that-could-not-run-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-temp [:model/Segment     {segment-id :id} (segment)
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
    (mt/with-temp [:model/Segment     {segment-id :id} (segment)
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
        (mt/with-temp [:model/Segment     {segment-id :id} (segment)
                       :model/SegmentTest {test-id :id}    {:segment_id segment-id}]
          (testing "a user who can read the segment but not enter Data Studio cannot list segment tests"
            (is (= test-id (:id (mt/user-http-request :rasta :get 200 (str "ee/segment-test/" test-id)))))
            (mt/user-http-request :rasta :get 403 "ee/segment-test"))
          (mt/with-data-analyst-role! (mt/user->id :lucky)
            (testing "a user who can enter Data Studio lists the tests of the segments they can read"
              (is (contains? (set (map :id (mt/user-http-request :lucky :get 200 "ee/segment-test"))) test-id)))))))))

(deftest permissions-test
  (mt/with-premium-features data-testing.test-util/data-analyst-features
    (perms.tu/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/Segment     {segment-id :id} (segment)
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
                (mt/user-http-request :rasta :post 403 "ee/segment-test" (body segment-id))
                (mt/user-http-request :rasta :put 403 path {:name "nope"})
                (mt/user-http-request :rasta :delete 403 path))
              (mt/with-data-analyst-role! (mt/user->id :lucky)
                (testing "a data analyst who may edit the segment and write native queries: create and update"
                  (let [created (mt/user-http-request :lucky :post 200 "ee/segment-test" (body segment-id))]
                    (t2/delete! :model/SegmentTest :id (:id created)))
                  (is (=? {:name "renamed"} (mt/user-http-request :lucky :put 200 path {:name "renamed"}))))))
            (mt/with-db-perms-for-group! (perms-group/all-users) (mt/id) {:perms/view-data      :unrestricted
                                                                          :perms/create-queries :query-builder}
              (mt/with-data-analyst-role! (mt/user->id :lucky)
                (testing "no native queries on the segment's database: 403 on create and on run"
                  (mt/user-http-request :lucky :post 403 "ee/segment-test" (body segment-id))
                  (mt/user-http-request :lucky :post 403 (str path "/run"))
                  (is (= test-id (:id (mt/user-http-request :lucky :get 200 path)))))))
            (finally
              (t2/delete! :model/DataTestRun :test_type "segment" :test_id test-id))))))))

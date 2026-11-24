(ns metabase-enterprise.data-testing.segment-api-test
  "`/api/ee/segment-test`."
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase-enterprise.data-testing.models.segment-test :as data-testing.models.segment-test]
   [metabase-enterprise.data-testing.run-tracking :as data-testing.run-tracking]
   [metabase-enterprise.data-testing.test-util :as data-testing.test-util]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.permissions.test-util :as perms.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- body
  [segment-id]
  {:segment_id   segment-id
   :name         "My test"
   :inputs       data-testing.test-util/google-segment-inputs
   :expectations data-testing.test-util/google-segment-expectations})

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
                     :expectations data-testing.test-util/google-segment-expectations}
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

(defn- segment-tests-state
  "The id, name and segment of every SegmentTest, to compare before and after a refused request."
  []
  (t2/select-fn-set (juxt :id :name :segment_id) :model/SegmentTest))

(deftest a-test-of-a-missing-segment-is-refused-as-forbidden-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-temp [:model/Segment     {segment-id :id} (data-testing.test-util/from-google-segment)
                   :model/Segment     {other-id :id}   (data-testing.test-util/from-google-segment)
                   :model/SegmentTest {test-id :id}    (body segment-id)]
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
                   :model/SegmentTest {test-id :id}    (body segment-id)]
      (testing "POST refuses a test missing an input, under the segment-test error prefix"
        (let [response (mt/user-http-request :crowberto :post 400 "ee/segment-test" (assoc (body segment-id) :inputs []))]
          (is (= "segment-test.missing-inputs" (:error-code response)))
          (is (= ["PUBLIC.PEOPLE"] (:tables response)))))
      (testing "POST refuses an input that lacks a column the segment's query reads, naming the table and the column"
        (is (=? {:error-code "segment-test.missing-input-columns"
                 :columns    {:PUBLIC.PEOPLE ["SOURCE"]}}
                (mt/user-http-request :crowberto :post 400 "ee/segment-test"
                                      (assoc (body segment-id)
                                             :inputs [(-> (first data-testing.test-util/google-segment-inputs)
                                                          (assoc :columns [{:name "ID" :cast_type "INTEGER"}])
                                                          (assoc :rows [{"ID" 1} {"ID" 2}]))])))))
      (testing "POST refuses a test with no data-testing.test-util/google-segment-expectations"
        (is (= "segment-test.no-expectations"
               (:error-code (mt/user-http-request :crowberto :post 400 "ee/segment-test"
                                                  (assoc (body segment-id) :expectations []))))))
      (testing "PUT refuses a change that makes the test unrunnable, and keeps the test"
        (is (= "segment-test.missing-inputs"
               (:error-code (mt/user-http-request :crowberto :put 400 (str "ee/segment-test/" test-id) {:inputs []}))))
        (is (= 1 (count (:inputs (t2/select-one :model/SegmentTest :id test-id)))))))))

(deftest a-test-of-a-segment-with-no-definition-is-refused-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-temp [:model/Segment     {segment-id :id} (data-testing.test-util/from-google-segment)
                   :model/SegmentTest {test-id :id}    {:segment_id   segment-id
                                                        :inputs       data-testing.test-util/google-segment-inputs
                                                        :expectations data-testing.test-util/google-segment-expectations}]
      (data-testing.test-util/empty-segment-definition! segment-id)
      (testing "POST refuses a test of a segment with no definition, as one whose query cannot be compiled"
        (is (=? {:error-code "segment-test.uncompilable-subject"}
                (mt/user-http-request :crowberto :post 422 "ee/segment-test" (body segment-id)))))
      (testing "a run of a saved test of it is refused the same way"
        (is (=? {:error-code "segment-test.uncompilable-subject"}
                (mt/user-http-request :crowberto :post 422 (str "ee/segment-test/" test-id "/run")))))
      (testing "an edit of the data-testing.test-util/google-segment-inputs of a saved test of it is refused the same way, and changes nothing"
        (let [before (t2/select-one :model/SegmentTest :id test-id)]
          (is (=? {:error-code "segment-test.uncompilable-subject"}
                  (mt/user-http-request :crowberto :put 422 (str "ee/segment-test/" test-id)
                                        {:inputs [(assoc (first data-testing.test-util/google-segment-inputs) :rows [{"ID" 3 "SOURCE" "Google"}])]})))
          (is (= before (t2/select-one :model/SegmentTest :id test-id))))))))

(deftest a-run-by-a-non-admin-of-a-test-of-a-segment-with-no-definition-is-forbidden-test
  (testing "the permission check comes first: a non-admin may not run an empty definition, so gets 403, not 422"
    (mt/with-premium-features data-testing.test-util/data-analyst-features
      (perms.tu/with-no-data-perms-for-all-users!
        (mt/with-db-perms-for-group! (perms-group/all-users) (mt/id) {:perms/view-data      :unrestricted
                                                                      :perms/create-queries :query-builder-and-native}
          (mt/with-temp [:model/Segment     {segment-id :id} (data-testing.test-util/from-google-segment)
                         :model/SegmentTest {test-id :id}    {:segment_id   segment-id
                                                              :inputs       data-testing.test-util/google-segment-inputs
                                                              :expectations data-testing.test-util/google-segment-expectations}]
            (let [path (str "ee/segment-test/" test-id "/run")]
              (try
                (testing "control: the non-admin runs the test while the segment has its definition"
                  (is (=? {:status "passed"} (mt/user-http-request :rasta :post 200 path))))
                (data-testing.test-util/empty-segment-definition! segment-id)
                (is (= "You don't have permissions to do that." (mt/user-http-request :rasta :post 403 path)))
                (testing "control: an admin gets the refusal of the empty definition"
                  (is (=? {:error-code "segment-test.uncompilable-subject"}
                          (mt/user-http-request :crowberto :post 422 path))))
                (finally
                  (t2/delete! :model/DataTestRun :test_type "segment" :test_id test-id))))))))))

(deftest a-test-of-a-segment-with-no-table-to-read-is-refused-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-temp [:model/Table       {table-id :id}   {:db_id (mt/id) :name "DROPPED" :active true}
                   :model/Segment     {segment-id :id} (data-testing.test-util/segment-on table-id "On a dropped table")
                   :model/SegmentTest {test-id :id}    {:segment_id   segment-id
                                                        :inputs       data-testing.test-util/google-segment-inputs
                                                        :expectations data-testing.test-util/google-segment-expectations}]
      (let [path (str "ee/segment-test/" test-id)]
        (try
          ;; Sync keeps the row of a dropped table and marks it inactive.
          (t2/update! :model/Table :id table-id {:active false})
          (testing "a segment whose table sync has marked inactive"
            (let [refusal {:error-code "segment-test.uncompilable-subject"
                           :message    "The segment's table no longer exists, so there is no query to test."}]
              (testing "POST refuses a test of it"
                (is (=? refusal (mt/user-http-request :crowberto :post 422 "ee/segment-test" (body segment-id)))))
              (testing "a run of a saved test of it is refused the same way"
                (is (=? refusal (mt/user-http-request :crowberto :post 422 (str path "/run")))))
              (testing "an edit of the data-testing.test-util/google-segment-inputs of a saved test of it is refused the same way, and changes nothing"
                (let [before (t2/select-one :model/SegmentTest :id test-id)]
                  (is (=? refusal (mt/user-http-request :crowberto :put 422 path {:inputs data-testing.test-util/google-segment-inputs})))
                  (is (= before (t2/select-one :model/SegmentTest :id test-id)))))))
          (testing "a segment whose definition names no table"
            ;; A raw write: the model refuses a definition with no source table.
            (t2/query-one {:update :segment
                           :set    {:definition (str "{\"lib/type\":\"mbql/query\",\"database\":" (mt/id) ","
                                                     "\"stages\":[{\"lib/type\":\"mbql.stage/native\","
                                                     "\"native\":\"SELECT 1\"}]}")}
                           :where  [:= :id segment-id]})
            (is (=? {:error-code "segment-test.uncompilable-subject"
                     :message    "The segment's definition names no table, so there is no query to test."}
                    (mt/user-http-request :crowberto :post 422 "ee/segment-test" (body segment-id)))))
          (finally
            (t2/delete! :model/DataTestRun :test_type "segment" :test_id test-id)))))))

(deftest a-revert-cannot-move-a-test-onto-an-archived-segment-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-temp [:model/Segment {archived-id :id} (data-testing.test-util/from-google-segment)
                   :model/Segment {active-id :id}   (data-testing.test-util/from-google-segment)]
      (let [test-id     (:id (mt/user-http-request :crowberto :post 200 "ee/segment-test" (body archived-id)))
            path        (str "ee/segment-test/" test-id)
            _           (mt/user-http-request :crowberto :put 200 path {:segment_id active-id})
            creation-id (->> (mt/user-http-request :crowberto :get 200 (str "revision/segment-test/" test-id))
                             (m/find-first :is_creation)
                             :id)]
        (try
          (t2/update! :model/Segment :id archived-id {:archived true})
          (testing "a revert to the revision on the archived segment is refused, and leaves the test where it is"
            (is (pos-int? creation-id))
            (is (=? {:error-code "segment-test.archived-subject"}
                    (mt/user-http-request :crowberto :post 422 "revision/revert"
                                          {:entity "segment-test" :id test-id :revision_id creation-id})))
            (is (= active-id (t2/select-one-fn :segment_id :model/SegmentTest :id test-id))))
          (testing "control: once the segment is restored, the same revert moves the test back"
            (t2/update! :model/Segment :id archived-id {:archived false})
            (mt/user-http-request :crowberto :post 200 "revision/revert"
                                  {:entity "segment-test" :id test-id :revision_id creation-id})
            (is (= archived-id (t2/select-one-fn :segment_id :model/SegmentTest :id test-id))))
          (finally
            (t2/delete! :model/SegmentTest :id test-id)))))))

(deftest run-saved-test-test
  (mt/with-premium-features #{:transforms-testing}
    ;; A run counts as the test's run only if it started after the test was created. The with-temp default for
    ;; `created_at` is the JVM's clock and the run's start time is the app DB's, so the test is dated in the past.
    (mt/with-temp [:model/Segment     {segment-id :id} (data-testing.test-util/from-google-segment)
                   :model/SegmentTest {test-id :id}    (assoc (body segment-id) :created_at #t "2025-01-01T00:00:00Z")]
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
                     :model/SegmentTest {test-id :id}    (body segment-id)]
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

(deftest tests-of-an-archived-segment-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-temp [:model/Segment     {segment-id :id} (data-testing.test-util/from-google-segment)
                   :model/Segment     {active-id :id}  (data-testing.test-util/from-google-segment)
                   :model/SegmentTest {test-id :id}    {:segment_id   segment-id
                                                        :inputs       data-testing.test-util/google-segment-inputs
                                                        :expectations data-testing.test-util/google-segment-expectations
                                                        :created_at   #t "2025-01-01T00:00:00Z"}]
      (let [path      (str "ee/segment-test/" test-id)
            run-ids   (atom #{})
            test-name (t2/select-one-fn :name :model/SegmentTest :id test-id)
            listed    (fn [& params]
                        (into #{} (map :id) (apply mt/user-http-request :crowberto :get 200 "ee/segment-test" params)))]
        (try
          (t2/update! :model/Segment :id segment-id {:archived true})
          (testing "the list leaves the test out, unless asked to include archived subjects"
            (is (not (contains? (listed) test-id)))
            (is (not (contains? (listed :segment-id segment-id) test-id)))
            (is (contains? (listed :include-archived true) test-id))
            (is (contains? (listed :segment-id segment-id :include-archived true) test-id)))
          (testing "the test is still readable by id"
            (is (=? {:id test-id} (mt/user-http-request :crowberto :get 200 path))))
          (testing "a run is refused, and records no run"
            (is (=? {:error-code "segment-test.archived-subject"}
                    (mt/user-http-request :crowberto :post 422 (str path "/run"))))
            (is (not (t2/exists? :model/DataTestRun :test_type "segment" :test_id test-id))))
          (testing "a new test of the segment is refused"
            (is (=? {:error-code "segment-test.archived-subject"}
                    (mt/user-http-request :crowberto :post 422 "ee/segment-test" (body segment-id)))))
          (testing "an edit that keeps the test on the segment is refused, and changes nothing"
            (is (=? {:error-code "segment-test.archived-subject"}
                    (mt/user-http-request :crowberto :put 422 path {:name "Renamed"})))
            (is (= test-name (t2/select-one-fn :name :model/SegmentTest :id test-id))))
          (testing "after the segment is restored, the test is listed and runs"
            (t2/update! :model/Segment :id segment-id {:archived false})
            (is (contains? (listed) test-id))
            (is (=? {:status "passed"} (mt/user-http-request :crowberto :post 200 (str path "/run")))))
          (testing "moving the test off an archived segment, onto an active one, is allowed"
            (t2/update! :model/Segment :id segment-id {:archived true})
            (is (=? {:segment_id active-id} (mt/user-http-request :crowberto :put 200 path {:segment_id active-id}))))
          (testing "moving the test back onto the archived segment is refused"
            (is (=? {:error-code "segment-test.archived-subject"}
                    (mt/user-http-request :crowberto :put 422 path {:segment_id segment-id}))))
          (testing "a test of an archived segment can be deleted"
            ;; Deleting the test clears `test_id` on its runs, so the cleanup below finds them by id.
            (reset! run-ids (t2/select-pks-set :model/DataTestRun :test_type "segment" :test_id test-id))
            (t2/update! :model/SegmentTest :id test-id {:segment_id segment-id})
            (mt/user-http-request :crowberto :delete 204 path)
            (is (not (t2/exists? :model/SegmentTest :id test-id))))
          (finally
            (t2/delete! :model/DataTestRun :test_type "segment" :test_id test-id)
            (when (seq @run-ids)
              (t2/delete! :model/DataTestRun :id [:in @run-ids]))))))))

(deftest segment-test-ignores-now-test
  (testing "a segment test has no `now`: the API drops it as it drops any key a request does not declare"
    (mt/with-premium-features #{:transforms-testing}
      (mt/with-temp [:model/Segment     {segment-id :id} (data-testing.test-util/from-google-segment)
                     :model/SegmentTest {test-id :id}    {:segment_id segment-id}]
        (let [path (str "ee/segment-test/" test-id)]
          (mt/with-model-cleanup [:model/SegmentTest]
            (is (not (contains? (mt/user-http-request :crowberto :post 200 "ee/segment-test"
                                                      (assoc (body segment-id) :now "2020-06-17T12:00:00Z"))
                                :now))))
          (is (not (contains? (mt/user-http-request :crowberto :put 200 path {:now "2020-06-17T12:00:00Z"}) :now)))
          (is (not (contains? (mt/user-http-request :crowberto :put 200 path {:now nil}) :now))))))))

(deftest a-revert-to-a-state-that-an-edit-would-refuse-is-refused-segment-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-temp [:model/Segment {subject-id :id} (data-testing.test-util/from-google-segment)]
      ;; Created through the model, which does not validate, so that its creation revision has no data-testing.test-util/google-segment-inputs. A revision is
      ;; recorded only under a current user.
      (let [test-id     (mt/with-current-user (mt/user->id :crowberto)
                          (:id (data-testing.models.segment-test/create-segment-test!
                                {:segment_id   subject-id
                                 :name         "No data-testing.test-util/google-segment-inputs"
                                 :inputs       []
                                 :expectations (mapv #(update % :type keyword) data-testing.test-util/google-segment-expectations)
                                 :creator_id   (mt/user->id :crowberto)})))
            path        (str "ee/segment-test/" test-id)
            creation-id (->> (mt/user-http-request :crowberto :get 200 (str "revision/segment-test/" test-id))
                             (m/find-first :is_creation)
                             :id)]
        (try
          (is (pos-int? creation-id) "premise: the test has a creation revision")
          (mt/user-http-request :crowberto :put 200 path {:inputs data-testing.test-util/google-segment-inputs})
          (testing "control: an edit back to no data-testing.test-util/google-segment-inputs is refused"
            (is (=? {:error-code "segment-test.missing-inputs"}
                    (mt/user-http-request :crowberto :put 400 path {:inputs []}))))
          (testing "a revert to the creation revision is refused the same way, and leaves the data-testing.test-util/google-segment-inputs"
            (is (=? {:error-code "segment-test.missing-inputs"}
                    (mt/user-http-request :crowberto :post 400 "revision/revert"
                                          {:entity "segment-test" :id test-id :revision_id creation-id})))
            (is (= 1 (count (:inputs (t2/select-one :model/SegmentTest :id test-id))))))
          (testing "a revert of the name alone is not validated, so it succeeds where an edit of the data-testing.test-util/google-segment-inputs is refused"
            (let [revision-id (-> (mt/user-http-request :crowberto :get 200 (str "revision/segment-test/" test-id))
                                  first
                                  :id)]
              (mt/user-http-request :crowberto :put 200 path {:name "Renamed"})
              ;; The segment now filters on a column that the data-testing.test-util/google-segment-inputs lack.
              (t2/update! :model/Segment :id subject-id
                          {:definition (let [mp (mt/metadata-provider)]
                                         (lib/filter (lib/query mp (lib.metadata/table mp (mt/id :people)))
                                                     (lib/= (lib.metadata/field mp (mt/id :people :name)) "abc")))})
              (testing "premise: an edit of the data-testing.test-util/google-segment-inputs is refused"
                (is (=? {:error-code "segment-test.missing-input-columns"}
                        (mt/user-http-request :crowberto :put 400 path {:inputs data-testing.test-util/google-segment-inputs}))))
              (mt/user-http-request :crowberto :post 200 "revision/revert"
                                    {:entity "segment-test" :id test-id :revision_id revision-id})
              (is (= "No data-testing.test-util/google-segment-inputs" (t2/select-one-fn :name :model/SegmentTest :id test-id)))))
          (finally
            (t2/delete! :model/SegmentTest :id test-id)))))))

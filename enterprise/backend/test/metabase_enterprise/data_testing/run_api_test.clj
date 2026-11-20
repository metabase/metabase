(ns metabase-enterprise.data-testing.run-api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.models.data-test-run :as data-testing.models.data-test-run]
   [metabase-enterprise.data-testing.run-tracking :as data-testing.run-tracking]
   [metabase-enterprise.data-testing.test-util :as data-testing.test-util]
   [metabase.lib.core :as lib]
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
        (testing "a card test that does not exist is not found"
          (mt/user-http-request :crowberto :get 404 path :test-type "card" :test-id Integer/MAX_VALUE))
        (testing "refuses users who can't read the test"
          (mt/user-http-request :rasta :get 403 path :test-type "transform" :test-id test-id))
        (testing "a test that does not exist is not found"
          (mt/user-http-request :crowberto :get 404 path :test-type "transform" :test-id Integer/MAX_VALUE))))))

(deftest last-run-is-the-first-listed-run-test
  (data-testing.test-util/with-transforms-enabled data-testing.test-util/data-analyst-features
    (mt/with-temp [:model/Transform    {transform-id :id} {}
                   :model/TransformTest {test-id :id}     {:transform_id transform-id
                                                           :created_at   #t "2026-01-01T10:00:00Z"}
                   ;; The run with the higher id started earlier.
                   :model/DataTestRun  {later-start-id :id} {:test_type  :transform
                                                             :test_id    test-id
                                                             :status     :passed
                                                             :start_time #t "2026-03-01T10:00:00Z"}
                   :model/DataTestRun  {higher-id :id}      {:test_type  :transform
                                                             :test_id    test-id
                                                             :status     :passed
                                                             :start_time #t "2026-02-01T10:00:00Z"}
                   ;; Two runs that start at the same instant: the higher id is the newer.
                   :model/TransformTest {tied-test-id :id} {:transform_id transform-id
                                                            :created_at   #t "2026-01-01T10:00:00Z"}
                   :model/DataTestRun  _                   {:test_type  :transform
                                                            :test_id    tied-test-id
                                                            :status     :passed
                                                            :start_time #t "2026-02-01T10:00:00Z"}
                   :model/DataTestRun  {tied-newer-id :id} {:test_type  :transform
                                                            :test_id    tied-test-id
                                                            :status     :failed
                                                            :start_time #t "2026-02-01T10:00:00Z"}]
      (let [last-run-id (fn [id]
                          (-> (mt/user-http-request :crowberto :get 200 (str "ee/transform-test/" id)) :last_run :id))
            first-listed-id (fn [id]
                              (-> (mt/user-http-request :crowberto :get 200 "ee/data-test-run"
                                                        :test-type "transform" :test-id id)
                                  :data first :id))]
        (testing "the list shows the run that started last first"
          (is (= [later-start-id higher-id]
                 (->> (mt/user-http-request :crowberto :get 200 "ee/data-test-run" :test-type "transform" :test-id test-id)
                      :data
                      (map :id)))))
        (testing "the last run of a test is the run that started last, not the one with the highest id"
          (is (= later-start-id (last-run-id test-id))))
        (testing "between runs that start at the same instant, the last run is the one with the higher id"
          (is (= tied-newer-id (first-listed-id tied-test-id)))
          (is (= tied-newer-id (last-run-id tied-test-id))))))))

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
            (t2/delete! (t2/table-name :model/TransformTest) :id old-test-id)
            (testing "a test row deleted without the model leaves its id on the run"
              (is (= old-test-id (t2/select-one-fn :test_id :model/DataTestRun :id run-id))))
            (t2/insert! (t2/table-name :model/TransformTest) {:id           old-test-id
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

(defn- people-query
  "A native query reading `ID` and `NAME` from the people table of the H2 test data."
  []
  (lib/native-query (mt/metadata-provider) "SELECT ID, NAME FROM PUBLIC.PEOPLE"))

(def ^:private people-input
  {:table {:schema "PUBLIC" :name "PEOPLE"} :format :sql :sql "SELECT 1 AS ID, 'abc' AS NAME"})

(def ^:private created-before-its-runs
  "A `created_at` for a test that runs in a deftest: `created_at` is the JVM's clock and the run's start time is the
  app DB's, so the test is dated in the past."
  #t "2025-01-01T00:00:00Z")

(defn- newest-run
  "The newest run of the `test-type` test `test-id` as `GET /api/ee/data-test-run/:id` returns it."
  [test-type test-id]
  (let [run-id (t2/select-one-fn :id :model/DataTestRun :test_type test-type :test_id test-id {:order-by [[:id :desc]]})]
    (mt/user-http-request :crowberto :get 200 (str "ee/data-test-run/" run-id))))

(deftest run-stores-what-its-caller-received-test
  (mt/test-driver :h2
    (data-testing.test-util/with-transforms-enabled data-testing.test-util/data-analyst-features
      (mt/with-temp [:model/Transform {transform-id :id}
                     {:source {:type :query :query (people-query)}
                      :target {:type "table" :schema "PUBLIC" :name "PEOPLE_SUMMARY" :database (mt/id)}}]
        (let [run (fn [expected-status transform-test f]
                    (mt/with-temp [:model/TransformTest {test-id :id} (assoc transform-test
                                                                             :transform_id transform-id
                                                                             :created_at   created-before-its-runs)]
                      (f (mt/user-http-request :crowberto :post expected-status (format "ee/transform-test/%d/run" test-id))
                         (newest-run :transform test-id))))]
          (testing "a passed run stores its result"
            (run 200
                 {:inputs       [people-input]
                  :expectations [{:type :empty :name "one id" :sql "SELECT * FROM PUBLIC.PEOPLE_SUMMARY WHERE ID <> 1"}]}
                 (fn [response run]
                   (is (= "passed" (:status response) (:status run)))
                   (is (= response (:result run))))))
          (testing "a failed run stores each expectation's result with its rows"
            (run 200
                 {:inputs       [people-input]
                  :expectations [{:type :empty :name "no abc" :sql "SELECT * FROM PUBLIC.PEOPLE_SUMMARY WHERE NAME = 'abc'"}
                                 {:type    :equals
                                  :name    "rows"
                                  :format  :rows
                                  :columns [{:name "ID" :cast_type "INTEGER"} {:name "NAME" :cast_type "VARCHAR"}]
                                  :rows    [{"ID" 2 "NAME" "def"}]}
                                 {:type :empty :name "broken" :sql "SELECT NO_SUCH_COLUMN FROM PUBLIC.PEOPLE_SUMMARY"}]}
                 (fn [response run]
                   (is (= "failed" (:status response) (:status run)))
                   (is (=? [{:name "no abc" :status "failed" :sample [{:ID 1 :NAME "abc"}]}
                            {:name         "rows"
                             :status       "failed"
                             :extra-rows   [{:ID 1 :NAME "abc"}]
                             :missing-rows [{:ID 2 :NAME "def"}]}
                            {:name "broken" :status "error" :error {:message string?}}]
                           (:expectations (:result run))))
                   (is (= response (:result run))))))
          (testing "a run that is refused after it starts stores the message and error code of the refusal"
            (run 422
                 {:inputs       [(assoc people-input :sql "SELECT * FROM NO_SUCH_TABLE")]
                  :expectations [{:type :empty :name "never reached" :sql "SELECT * FROM PUBLIC.PEOPLE_SUMMARY"}]}
                 (fn [response run]
                   (is (= "error" (:status run)))
                   (is (= "transform-test.setup-failed" (:error-code response)))
                   (is (= (select-keys response [:message :error-code]) (:result run)))))))))))

(deftest card-test-run-stores-what-its-caller-received-test
  (mt/test-driver :h2
    (data-testing.test-util/with-transforms-enabled data-testing.test-util/data-analyst-features
      (mt/with-temp [:model/Card     {card-id :id}  {:dataset_query (people-query)}
                     :model/CardTest {failed-id :id} {:card_id      card-id
                                                      :created_at   created-before-its-runs
                                                      :inputs       [people-input]
                                                      :expectations [{:type :empty
                                                                      :name "no abc"
                                                                      :sql  "SELECT * FROM {{output}} WHERE NAME = 'abc'"}]}
                     :model/CardTest {error-id :id}  {:card_id      card-id
                                                      :created_at   created-before-its-runs
                                                      :inputs       [(assoc people-input :sql "SELECT * FROM NO_SUCH_TABLE")]
                                                      :expectations [{:type :empty
                                                                      :name "never reached"
                                                                      :sql  "SELECT * FROM {{output}}"}]}]
        (testing "a failed run stores its result"
          (let [response (mt/user-http-request :crowberto :post 200 (format "ee/card-test/%d/run" failed-id))]
            (is (=? {:status "failed" :result response}
                    (newest-run :card failed-id)))))
        (testing "a refused run stores the error code of its own test type"
          (let [response (mt/user-http-request :crowberto :post 422 (format "ee/card-test/%d/run" error-id))]
            (is (= "card-test.setup-failed" (:error-code response)))
            (is (=? {:status "error" :result (select-keys response [:message :error-code])}
                    (newest-run :card error-id)))))))))

(deftest get-run-test
  (data-testing.test-util/with-transforms-enabled data-testing.test-util/data-analyst-features
    (mt/with-temp [:model/Transform     {transform-id :id} {}
                   :model/TransformTest {test-id :id}      {:transform_id transform-id
                                                            :created_at   #t "2026-01-01T10:00:00Z"}
                   :model/DataTestRun   {run-id :id}       {:test_type    :transform
                                                            :test_id      test-id
                                                            :initiated_by (mt/user->id :crowberto)
                                                            :status       :failed
                                                            :start_time   #t "2026-02-01T10:00:00Z"
                                                            :end_time     #t "2026-02-01T10:00:02Z"}
                   :model/DataTestRun   {before-id :id}    {:test_type  :transform
                                                            :test_id    test-id
                                                            :status     :failed
                                                            :start_time #t "2025-12-01T10:00:00Z"}
                   :model/DataTestRun   {orphan-id :id}    {:test_type :transform, :test_id nil, :status :failed}]
      (let [path (str "ee/data-test-run/" run-id)]
        (testing "a run that stored no result, as every run did before results were stored, reads back with none"
          (is (=? {:id                run-id
                   :test_type         "transform"
                   :test_id           test-id
                   :status            "failed"
                   :initiated_by_user {:common_name "Crowberto Corv"}
                   :result            nil}
                  (mt/user-http-request :crowberto :get 200 path))))
        (testing "the list and the last run of a test leave the result out"
          (let [listed (-> (mt/user-http-request :crowberto :get 200 "ee/data-test-run"
                                                 :test-type "transform" :test-id test-id)
                           :data
                           first)]
            (is (= run-id (:id listed)))
            (is (not (contains? listed :result))))
          (is (not (contains? (:last_run (mt/user-http-request :crowberto :get 200 (str "ee/transform-test/" test-id)))
                              :result))))
        (testing "refuses users who can't read the test"
          (mt/user-http-request :rasta :get 403 path))
        (testing "a run that does not exist is not found"
          (mt/user-http-request :crowberto :get 404 (str "ee/data-test-run/" Integer/MAX_VALUE)))
        (testing "a run that started before its test was created is not found"
          (mt/user-http-request :crowberto :get 404 (str "ee/data-test-run/" before-id)))
        (testing "the run of a deleted test is not found"
          (mt/user-http-request :crowberto :get 404 (str "ee/data-test-run/" orphan-id)))))))

(deftest get-run-result-only-for-its-initiator-and-admins-test
  (data-testing.test-util/with-transforms-enabled data-testing.test-util/data-analyst-features
    (let [result  {:message "The query under test failed to run." :error-code "transform-test.query-failed"}
          run-of  (fn [test-id user]
                    {:test_type    :transform
                     :test_id      test-id
                     :initiated_by (some-> user mt/user->id)
                     :status       :error
                     :result       result})
          path    #(str "ee/data-test-run/" %)
          visible {:result result :can_read_result true}
          hidden  {:status "error" :result nil :can_read_result false}]
      (mt/with-temp [:model/Transform     {transform-id :id} (data-testing.test-util/id-transform :people)
                     :model/TransformTest {test-id :id}      {:transform_id transform-id
                                                              :created_at   created-before-its-runs}
                     :model/DataTestRun   {own-id :id}       (run-of test-id :lucky)
                     :model/DataTestRun   {admin-id :id}     (run-of test-id :crowberto)
                     :model/DataTestRun   {nobody-id :id}    (run-of test-id nil)]
        (testing "an admin gets the stored result of any run"
          (doseq [run-id [own-id admin-id nobody-id]]
            (is (=? visible (mt/user-http-request :crowberto :get 200 (path run-id))))))
        (mt/with-data-analyst-role! (mt/user->id :lucky)
          (testing "a user who can run the test gets the stored result of a run they started"
            (is (=? visible (mt/user-http-request :lucky :get 200 (path own-id)))))
          (testing "but not of a run someone else started, which read rows with that user's database access"
            (is (=? hidden (mt/user-http-request :lucky :get 200 (path admin-id))))
            (is (=? hidden (mt/user-http-request :lucky :get 200 (path nobody-id)))))
          (testing "and of their own run without native access, as they may still run the test"
            (mt/with-db-perms-for-group! (perms-group/all-users) (mt/id) {:perms/transforms     :no
                                                                          :perms/create-queries :query-builder}
              (is (=? visible (mt/user-http-request :lucky :get 200 (path own-id)))))))))))

(deftest unreadable-stored-result-reads-as-none-test
  (data-testing.test-util/with-transforms-enabled data-testing.test-util/data-analyst-features
    (mt/with-temp [:model/Transform     {transform-id :id} {}
                   :model/TransformTest {test-id :id}      {:transform_id transform-id
                                                            :created_at   created-before-its-runs}
                   :model/DataTestRun   {run-id :id}       {:test_type :transform, :test_id test-id, :status :failed}]
      (doseq [stored ["not json"
                      "{\"bogus\":1}"
                      "{\"status\":1,\"expectations\":[{\"type\":1,\"status\":2}],\"tables\":{}}"]]
        (testing stored
          (t2/update! :data_test_run :id run-id {:result stored})
          (is (=? {:id run-id :status "failed" :result nil :can_read_result true}
                  (mt/user-http-request :crowberto :get 200 (str "ee/data-test-run/" run-id)))))))))

(deftest stored-result-is-bounded-test
  (let [stored-result #(t2/select-one-fn :result [:model/DataTestRun :result] :id %)]
    (testing "a long string of a result is cut"
      (mt/with-temp [:model/DataTestRun {run-id :id} {:status :error
                                                      :result {:message    (str/join (repeat 5000 "x"))
                                                               :error-code "transform-test.query-failed"}}]
        (is (= {:message    (str (str/join (repeat 1000 "x")) "…")
                :error-code "transform-test.query-failed"}
               (stored-result run-id)))))
    (testing "a result that is still too large is not stored"
      (with-redefs [data-testing.models.data-test-run/max-stored-result-length 10]
        (mt/with-temp [:model/DataTestRun {run-id :id} {:status :error
                                                        :result {:message    "The query under test failed to run."
                                                                 :error-code "transform-test.query-failed"}}]
          (is (nil? (stored-result run-id))))))))

(deftest run-finishes-without-a-result-that-cannot-be-stored-test
  (mt/with-temp [:model/Transform     {transform-id :id} {}
                 :model/TransformTest {test-id :id}      {:transform_id transform-id}]
    (let [{run-id :id} (data-testing.run-tracking/start-run! :transform test-id)
          finish!      (mt/original-fn #'data-testing.db/finish-started-test-run!)]
      (try
        (mt/with-dynamic-fn-redefs [data-testing.db/finish-started-test-run! (fn [run-id status result]
                                                                               (when result
                                                                                 (throw (ex-info "Packet too large" {})))
                                                                               (finish! run-id status result))]
          (data-testing.run-tracking/finish-run! run-id :failed {:message    "The query under test failed to run."
                                                                 :error-code "transform-test.query-failed"}))
        (is (=? {:status :failed :end_time some? :result nil}
                (t2/select-one [:model/DataTestRun :*] :id run-id)))
        (finally
          (t2/delete! :model/DataTestRun :id run-id))))))

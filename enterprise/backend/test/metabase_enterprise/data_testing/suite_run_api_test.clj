(ns metabase-enterprise.data-testing.suite-run-api-test
  "`POST /api/ee/test-suite/:id/run` and `GET /api/ee/test-suite/:id/runs`."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.data-testing.models :as data-testing.models]
   [metabase-enterprise.data-testing.run-tracking :as data-testing.run-tracking]
   [metabase-enterprise.data-testing.runner :as data-testing.runner]
   [metabase-enterprise.data-testing.test-util :as data-testing.test-util]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(def ^:private inputs
  [{:table   {:schema "PUBLIC" :name "PEOPLE"}
    :format  "rows"
    :columns [{:name "ID" :cast_type "INTEGER"} {:name "NAME" :cast_type "VARCHAR"}]
    :rows    [{"ID" 1 "NAME" "abc"}]}])

(def ^:private passing
  "Expectations the card below meets with [[inputs]]."
  [{:type "empty" :name "no other rows" :sql "SELECT * FROM {{output}} WHERE ID <> 1"}])

(def ^:private failing
  "Expectations the card below fails with [[inputs]]: its output has one row."
  [{:type "empty" :name "no rows" :sql "SELECT * FROM {{output}}"}])

(defn- native-card
  "A native card with the query `sql`, in the collection `collection-id`."
  [collection-id sql]
  {:name          "People"
   :collection_id collection-id
   :dataset_query (lib/native-query (mt/metadata-provider) sql)})

(defn- card
  "A native card reading the table that [[inputs]] stands in for, in the collection `collection-id`."
  [collection-id]
  (native-card collection-id "SELECT ID, NAME FROM PUBLIC.PEOPLE"))

(defn- run-path [suite-id] (str "ee/test-suite/" suite-id "/run"))

(defn- runs-path [suite-id] (str "ee/test-suite/" suite-id "/runs"))

(deftest premium-feature-test
  (mt/with-premium-features #{}
    (mt/with-temp [:model/TestSuite {suite-id :id} {}]
      (doseq [request [[:post 402 (run-path suite-id)]
                       [:get 402 (runs-path suite-id)]]]
        (mt/assert-has-premium-feature-error "Transforms Testing" (apply mt/user-http-request :crowberto request))))))

(deftest run-suite-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-temp [:model/Card      {card-id :id}         (card nil)
                   :model/CardTest  {pass-id :id
                                     pass-eid :entity_id} {:card_id card-id :name "Pass" :inputs inputs :expectations passing}
                   :model/CardTest  {fail-id :id
                                     fail-eid :entity_id} {:card_id card-id :name "Fail" :inputs inputs :expectations failing}
                   :model/CardTest  {refused-id :id
                                     refused-eid :entity_id} {:card_id card-id :name "Refused" :inputs [] :expectations passing}
                   :model/TestSuite {suite-id :id}        {}
                   :model/TestSuite {passing-suite :id}   {}
                   :model/TestSuite {missing-suite :id}   {}
                   :model/TestSuite {empty-suite :id}     {}]
      (let [missing-eid (u/generate-nano-id)]
        (data-testing.test-util/add-members! suite-id [[:card pass-eid] [:card fail-eid] [:card refused-eid] [:card missing-eid]])
        (data-testing.test-util/add-members! passing-suite [[:card pass-eid]])
        (data-testing.test-util/add-members! missing-suite [[:card pass-eid] [:card missing-eid]])
        (let [response (mt/user-http-request :crowberto :post 200 (run-path suite-id))
              [pass fail refused missing] (:members response)]
          (testing "each member reports its own outcome, in order, and the suite fails"
            (is (=? {:id       pos-int?
                     :suite_id suite-id
                     :status   "failed"
                     :members  [{:status "passed" :test_id pass-id :name "Pass" :position 0}
                                {:status "failed" :test_id fail-id :name "Fail" :position 1}
                                {:status "refused" :test_id refused-id :name "Refused" :position 2}
                                {:status "missing" :test_entity_id missing-eid :position 3}]}
                    response)))
          (testing "a member that ran links its run and carries its result"
            (is (=? {:status :passed :test_id pass-id :test_type :card}
                    (t2/select-one :model/DataTestRun :id (:data_test_run_id pass))))
            (is (= "passed" (get-in pass [:result :status])))
            (is (= "failed" (get-in fail [:result :status]))))
          (testing "a refused member has the refusal's error code, prefixed by its test type, and no result"
            (is (= "card-test.missing-inputs" (get-in refused [:error :error_code])))
            (is (nil? (:result refused))))
          (testing "a missing member is reported by type and entity id only"
            (is (= {:test_type "card" :test_entity_id missing-eid :position 3 :status "missing"} missing)))
          (testing "the run is recorded with its outcome"
            (is (=? {:suite_id     suite-id
                     :status       :failed
                     :initiated_by (mt/user->id :crowberto)
                     :end_time     some?
                     :members      [{:status :passed :data_test_run_id (:data_test_run_id pass)}
                                    {:status :failed}
                                    {:status :refused :error {:error_code "card-test.missing-inputs"}}
                                    {:status :missing}]}
                    (t2/select-one :model/TestSuiteRun :id (:id response))))))
        (testing "control: a suite passes when every member passes"
          (is (= "passed" (:status (mt/user-http-request :crowberto :post 200 (run-path passing-suite))))))
        (testing "a missing member fails a suite whose other members pass"
          (is (=? {:status "failed" :members [{:status "passed"} {:status "missing"}]}
                  (mt/user-http-request :crowberto :post 200 (run-path missing-suite)))))
        (testing "an empty suite passes"
          (is (= {:status "passed" :members []}
                 (select-keys (mt/user-http-request :crowberto :post 200 (run-path empty-suite)) [:status :members]))))
        (testing "GET runs pages the history of one suite, newest first, without results or names"
          (let [{newest :id}                      (mt/user-http-request :crowberto :post 200 (run-path suite-id))
                {:keys [data total limit offset]} (mt/user-http-request :crowberto :get 200 (runs-path suite-id) :limit 1)]
            (is (= [2 1 0] [total limit offset]))
            (is (=? [{:id                newest
                      :suite_id          suite-id
                      :status            "failed"
                      :initiated_by_user {:id (mt/user->id :crowberto)}
                      :members           [{:status "passed" :test_entity_id pass-eid :data_test_run_id pos-int?}
                                          {:status "failed"}
                                          {:status "refused" :error {:error_code "card-test.missing-inputs"}}
                                          {:status "missing"}]}]
                    data))
            (is (not-any? #(or (contains? % :result) (contains? % :name) (contains? % :test_id))
                          (:members (first data))))))
        (testing "a suite that does not exist is a 404"
          (let [no-suite (inc (t2/select-one-fn :max-id [:model/TestSuite [:%max.id :max-id]]))]
            (mt/user-http-request :crowberto :post 404 (run-path no-suite))
            (mt/user-http-request :crowberto :get 404 (runs-path no-suite))))))))

(deftest run-suite-of-segment-tests-test
  (mt/with-premium-features #{:transforms-testing}
    (let [segment-inputs       data-testing.test-util/google-segment-inputs
          segment-expectations data-testing.test-util/google-segment-expectations]
      (mt/with-temp [:model/Segment     {segment-id :id}  (data-testing.test-util/from-google-segment)
                     :model/SegmentTest {pass-id :id
                                         pass-eid :entity_id} {:segment_id   segment-id
                                                               :name         "Pass"
                                                               :inputs       segment-inputs
                                                               :expectations segment-expectations}
                     :model/SegmentTest {refused-id :id
                                         refused-eid :entity_id} {:segment_id segment-id :name "Refused"
                                                                  :inputs [] :expectations segment-expectations}
                     :model/TestSuite   {suite-id :id}    {}]
        (data-testing.test-util/add-members! suite-id [[:segment pass-eid] [:segment refused-eid]])
        (try
          (testing "each segment member reports the outcome of its own run endpoint"
            (is (= "passed" (:status (mt/user-http-request :crowberto :post 200 (str "ee/segment-test/" pass-id "/run")))))
            (is (= "segment-test.missing-inputs"
                   (:error-code (mt/user-http-request :crowberto :post 400 (str "ee/segment-test/" refused-id "/run")))))
            (is (=? {:status  "failed"
                     :members [{:status "passed" :test_type "segment" :test_id pass-id :name "Pass"}
                               {:status "refused" :test_type "segment" :test_id refused-id
                                :error  {:error_code "segment-test.missing-inputs"}}]}
                    (mt/user-http-request :crowberto :post 200 (run-path suite-id)))))
          (finally
            (t2/delete! :model/DataTestRun :test_type "segment" :test_id [:in [pass-id refused-id]])))))))

(deftest run-suite-permissions-test
  (mt/with-premium-features data-testing.test-util/data-analyst-features
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {coll-id :id}          {}
                     :model/Collection {hidden-coll-id :id}   {}
                     :model/Card       {card-id :id}          (card coll-id)
                     :model/Card       {hidden-card-id :id}   (card hidden-coll-id)
                     :model/CardTest   {readable-eid :entity_id} {:card_id card-id :name "Readable" :inputs [] :expectations passing}
                     :model/CardTest   {hidden-id :id
                                        hidden-eid :entity_id} {:card_id hidden-card-id :name "Hidden" :inputs [] :expectations passing}
                     :model/TestSuite  {suite-id :id}         {}]
        (data-testing.test-util/add-members! suite-id [[:card readable-eid] [:card hidden-eid]])
        (perms/grant-collection-read-permissions! (perms-group/all-users) coll-id)
        (testing "a user who cannot enter Data Studio cannot run a suite or read its history"
          (mt/user-http-request :rasta :post 403 (run-path suite-id))
          (mt/user-http-request :rasta :get 403 (runs-path suite-id)))
        (testing "setup: an admin's run records a refusal, with its error, for both members"
          (is (=? {:members [{:status "refused"} {:status "refused" :error {:message string?}}]}
                  (mt/user-http-request :crowberto :post 200 (run-path suite-id)))))
        (mt/with-data-analyst-role! (mt/user->id :lucky)
          (testing "the history hides the error of a member the reader cannot read"
            (let [[readable hidden] (-> (mt/user-http-request :lucky :get 200 (runs-path suite-id)) :data first :members)]
              (is (contains? readable :error))
              (is (= {:test_type "card" :test_entity_id hidden-eid :position 1 :status "refused"} hidden))))
          (testing "a member the user cannot read is forbidden, shown without its name, and not run"
            (let [runs-before (t2/count :model/DataTestRun :test_type "card" :test_id hidden-id)]
              (is (= {:test_type "card" :test_entity_id hidden-eid :position 1 :status "forbidden"}
                     (second (:members (mt/user-http-request :lucky :post 200 (run-path suite-id))))))
              (is (= runs-before (t2/count :model/DataTestRun :test_type "card" :test_id hidden-id))))))))))

(def ^:private failing-sql
  "SQL that fails on the warehouse; the failure message quotes it, marker included."
  "SELECT ID, NAME, 'SECRET_MARKER' AS S FROM PUBLIC.PEOPLE WHERE NOPE_COLUMN = 1")

(deftest run-history-withholds-errors-from-reader-who-cannot-run-test
  (mt/with-premium-features data-testing.test-util/data-analyst-features
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {coll-id :id}        {}
                     :model/Collection {hidden-coll-id :id} {}
                     :model/Card       {source-id :id}      (native-card hidden-coll-id failing-sql)]
        (let [mp (mt/metadata-provider)]
          (mt/with-temp [:model/Card      {card-id :id}             {:name          "On source"
                                                                     :collection_id coll-id
                                                                     :dataset_query (lib/query mp (lib.metadata/card mp source-id))}
                         :model/CardTest  {test-id :id eid :entity_id} {:card_id card-id :name "Readable" :inputs inputs :expectations passing}
                         :model/TestSuite {suite-id :id}            {}]
            (data-testing.test-util/add-members! suite-id [[:card eid]])
            (perms/grant-collection-read-permissions! (perms-group/all-users) coll-id)
            (mt/user-http-request :crowberto :post 200 (run-path suite-id))
            (testing "control: a reader who may run the test sees the error, which quotes the source card's SQL"
              (is (str/includes? (-> (mt/user-http-request :crowberto :get 200 (runs-path suite-id))
                                     :data first :members first :error :message str)
                                 "SECRET_MARKER")))
            (mt/with-data-analyst-role! (mt/user->id :lucky)
              (testing "premise: the reader reads the test and its card, not the source card, and may not run the test"
                (mt/user-http-request :lucky :get 200 (str "ee/card-test/" test-id))
                (mt/user-http-request :lucky :get 200 (str "card/" card-id))
                (mt/user-http-request :lucky :get 403 (str "card/" source-id))
                (mt/user-http-request :lucky :post 403 (str "ee/card-test/" test-id "/run")))
              (testing "the history withholds a member's error message from a reader who may not run its test"
                (is (nil? (-> (mt/user-http-request :lucky :get 200 (runs-path suite-id))
                              :data first :members first :error :message)))))))))))

(deftest run-history-withholds-errors-of-deleted-test-test
  (mt/with-premium-features data-testing.test-util/data-analyst-features
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {hidden-coll-id :id} {}
                     :model/Card       {hidden-card-id :id} (native-card hidden-coll-id failing-sql)
                     :model/CardTest   {hidden-id :id
                                        hidden-eid :entity_id} {:card_id hidden-card-id :name "Hidden" :inputs inputs :expectations passing}
                     :model/TestSuite  {suite-id :id}       {}]
        (data-testing.test-util/add-members! suite-id [[:card hidden-eid]])
        (testing "premise: the run recorded an error that quotes the hidden card's SQL"
          (is (str/includes? (-> (mt/user-http-request :crowberto :post 200 (run-path suite-id))
                                 :members first :error :message str)
                             "SECRET_MARKER")))
        (mt/with-data-analyst-role! (mt/user->id :lucky)
          (letfn [(member-as [user] (-> (mt/user-http-request user :get 200 (runs-path suite-id)) :data first :members first))]
            (testing "control: while the test exists, an admin sees its error, and a reader who cannot read it does not"
              (is (=? {:status "refused" :error {:message #(str/includes? % "SECRET_MARKER")}} (member-as :crowberto)))
              (is (=? {:status "refused"} (member-as :lucky)))
              (is (not (contains? (member-as :lucky) :error))))
            (t2/delete! :model/CardTest :id hidden-id)
            (testing "after the test is deleted, the history withholds its error from every reader, the admin too"
              (doseq [user [:lucky :crowberto]]
                (testing user
                  (is (=? {:status "refused"} (member-as user)))
                  (is (not (contains? (member-as user) :error))))))))))))

(deftest run-response-agrees-with-stored-run-when-reaped-mid-run-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-temp [:model/Card      {card-id :id}      (card nil)
                   :model/CardTest  {eid-0 :entity_id} {:card_id card-id :name "First" :inputs inputs :expectations passing}
                   :model/CardTest  {eid-1 :entity_id} {:card_id card-id :name "Second" :inputs inputs :expectations passing}
                   :model/TestSuite {suite-id :id}     {}]
      (data-testing.test-util/add-members! suite-id [[:card eid-0] [:card eid-1]])
      (let [run-test! (mt/original-fn #'data-testing.runner/run-test!)
            calls     (atom 0)
            reaped    (atom nil)]
        (mt/with-dynamic-fn-redefs [data-testing.runner/run-test! (fn [& args]
                                                                    (when (= 2 (swap! calls inc))
                                                                      (t2/query {:update (t2/table-name :model/TestSuiteRun)
                                                                                 :set    {:last_heartbeat (t/minus (t/offset-date-time) (t/minutes 10))}
                                                                                 :where  [:and [:= :suite_id suite-id] [:= :status "started"]]})
                                                                      (reset! reaped (mapv :id (data-testing.run-tracking/reap-orphaned-suite-runs! 5))))
                                                                    (apply run-test! args))]
          (let [response (mt/user-http-request :crowberto :post 200 (run-path suite-id))
                stored   (-> (mt/user-http-request :crowberto :get 200 (runs-path suite-id)) :data first)]
            (testing "premise: the reaper timed the run out between its members"
              (is (= [(:id response)] @reaped)))
            (testing "the response and the stored run report the same status and member outcomes"
              (is (= [(:status response) (mapv :status (:members response))]
                     [(:status stored) (mapv :status (:members stored))])))))))))

(deftest member-exception-before-its-run-is-its-error-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-temp [:model/Card      {card-id :id}            (card nil)
                   :model/CardTest  {eid-0 :entity_id}       {:card_id card-id :name "First" :inputs inputs :expectations passing}
                   :model/CardTest  {id-1 :id eid-1 :entity_id} {:card_id card-id :name "Second" :inputs inputs :expectations passing}
                   :model/CardTest  {eid-2 :entity_id}       {:card_id card-id :name "Third" :inputs inputs :expectations passing}
                   :model/TestSuite {suite-id :id}           {}]
      (data-testing.test-util/add-members! suite-id [[:card eid-0] [:card eid-1] [:card eid-2]])
      (letfn [(run-and-stored []
                (let [{:keys [status body]} (mt/user-http-request-full-response :crowberto :post (run-path suite-id))]
                  [status
                   (select-keys body [:status :members])
                   (select-keys (-> (mt/user-http-request :crowberto :get 200 (runs-path suite-id)) :data first)
                                [:status :members])]))
              (outcome [message]
                {:status  "failed"
                 :members [{:status "passed"}
                           {:status "error" :error {:message message}}
                           {:status "passed"}]})]
        (testing "control: an exception inside a member's run is that member's error"
          (let [run-test! (mt/original-fn #'data-testing.runner/run-test!)]
            (mt/with-dynamic-fn-redefs [data-testing.runner/run-test! (fn [test-type subject saved-test & more]
                                                                        (if (= id-1 (:id saved-test))
                                                                          (throw (ex-info "inside the run" {}))
                                                                          (apply run-test! test-type subject saved-test more)))]
              (is (=? [200 (outcome "inside the run") (outcome "inside the run")]
                      (run-and-stored))))))
        (testing "an exception in a member's permission check is that member's error"
          (let [answers (mt/original-fn #'data-testing.models/assoc-can-query)]
            (mt/with-dynamic-fn-redefs [data-testing.models/assoc-can-query
                                        (fn [tests & more]
                                          (if (some #(= id-1 (:id %)) tests)
                                            (throw (ex-info "in the permission check" {}))
                                            (apply answers tests more)))]
              (let [[status response stored] (run-and-stored)]
                (is (=? [200 (outcome "in the permission check")] [status response]))
                (testing "and the history, whose own check of that member throws too, withholds the error"
                  (is (=? {:status "failed" :members [{:status "passed"} {:status "error"} {:status "passed"}]} stored))
                  (is (not (contains? (second (:members stored)) :error))))))))))))

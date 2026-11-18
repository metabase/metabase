(ns metabase-enterprise.data-testing.suite-run-api-test
  "`POST /api/ee/test-suite/:id/run` and `GET /api/ee/test-suite/:id/runs`."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-testing.test-util :as data-testing.test-util]
   [metabase.lib.core :as lib]
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

(defn- card
  "A native card reading the table [[inputs]] stands in for, in the collection `collection-id`."
  [collection-id]
  {:name          "People"
   :collection_id collection-id
   :dataset_query (lib/native-query (mt/metadata-provider) "SELECT ID, NAME FROM PUBLIC.PEOPLE")})

(defn- add-members!
  "Make `refs`, `[test-type entity-id]` pairs, the members of the suite `suite-id`, in order."
  [suite-id refs]
  (t2/insert! :model/TestSuiteMember (map-indexed (fn [i [test-type eid]]
                                                    {:suite_id suite-id :test_type test-type :test_entity_id eid :position i})
                                                  refs)))

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
        (add-members! suite-id [[:card pass-eid] [:card fail-eid] [:card refused-eid] [:card missing-eid]])
        (add-members! passing-suite [[:card pass-eid]])
        (add-members! missing-suite [[:card pass-eid] [:card missing-eid]])
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
          (testing "a refused member carries the refusal under the code of its test type"
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
        (testing "control: a suite whose every member passes passes"
          (is (= "passed" (:status (mt/user-http-request :crowberto :post 200 (run-path passing-suite))))))
        (testing "a missing member fails a suite whose other members pass"
          (is (=? {:status "failed" :members [{:status "passed"} {:status "missing"}]}
                  (mt/user-http-request :crowberto :post 200 (run-path missing-suite)))))
        (testing "an empty suite passes"
          (is (= {:status "passed" :members []}
                 (select-keys (mt/user-http-request :crowberto :post 200 (run-path empty-suite)) [:status :members]))))
        (testing "GET runs pages the history of one suite, newest first, without results or names"
          (mt/user-http-request :crowberto :post 200 (run-path suite-id))
          (let [{:keys [data total limit offset]} (mt/user-http-request :crowberto :get 200 (runs-path suite-id) :limit 1)]
            (is (= [2 1 0] [total limit offset]))
            (is (=? [{:suite_id          suite-id
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
        (add-members! suite-id [[:card readable-eid] [:card hidden-eid]])
        (perms/grant-collection-read-permissions! (perms-group/all-users) coll-id)
        (testing "a user who cannot enter Data Studio cannot run a suite or read its history"
          (mt/user-http-request :rasta :post 403 (run-path suite-id))
          (mt/user-http-request :rasta :get 403 (runs-path suite-id)))
        (testing "an admin's run refuses the hidden test, and records why"
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

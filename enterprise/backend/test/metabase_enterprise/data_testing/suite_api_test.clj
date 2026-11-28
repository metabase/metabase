(ns metabase-enterprise.data-testing.suite-api-test
  "`/api/ee/test-suite`."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.data-testing.models.test-suite :as test-suite]
   [metabase-enterprise.data-testing.test-util :as data-testing.test-util]
   [metabase.app-db.core :as mdb]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest premium-feature-test
  (testing "every CRUD endpoint refuses an instance without the feature"
    (mt/with-premium-features #{}
      (mt/with-temp [:model/TestSuite {suite-id :id} {}]
        (let [path (str "ee/test-suite/" suite-id)]
          (doseq [request [[:get 402 "ee/test-suite"]
                           [:post 402 "ee/test-suite" {:name "s" :members []}]
                           [:get 402 path]
                           [:put 402 path {:name "t"}]
                           [:delete 402 path]]]
            (mt/assert-has-premium-feature-error
             "Transforms Testing"
             (apply mt/user-http-request :crowberto request))))))))

(deftest crud-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-temp [:model/Card     {card-id :id}  {}
                   :model/CardTest {test-a :id
                                    eid-a  :entity_id} {:card_id card-id :name "A"}
                   :model/CardTest {test-b :id
                                    eid-b  :entity_id} {:card_id card-id :name "B"}]
      (let [created (mt/user-http-request :crowberto :post 200 "ee/test-suite"
                                          {:name        "Nightly"
                                           :description "abc"
                                           :members     [{:test_type "card" :test_id test-b}
                                                         {:test_type "card" :test_id test-a}]})
            path    (str "ee/test-suite/" (:id created))]
        (try
          (testing "POST creates the suite as the current user, with its members in the order given"
            (is (=? {:id          pos-int?
                     :entity_id   string?
                     :name        "Nightly"
                     :description "abc"
                     :creator_id  (mt/user->id :crowberto)
                     :members     [{:test_type "card" :test_entity_id eid-b :test_id test-b :name "B"
                                    :position 0 :status "readable"}
                                   {:test_type "card" :test_entity_id eid-a :test_id test-a :name "A"
                                    :position 1 :status "readable"}]}
                    created)))
          (testing "GET returns the suite"
            (is (= created (mt/user-http-request :crowberto :get 200 path))))
          (testing "GET / lists it"
            (is (some #{created} (mt/user-http-request :crowberto :get 200 "ee/test-suite"))))
          (testing "PUT without members changes only the given keys"
            (is (=? {:name "Renamed" :description "abc" :members [{:test_id test-b} {:test_id test-a}]}
                    (mt/user-http-request :crowberto :put 200 path {:name "Renamed"}))))
          (testing "PUT with members replaces them, in the new order, by id or by entity id"
            (is (=? {:members [{:test_id test-a :position 0} {:test_id test-b :position 1}]}
                    (mt/user-http-request :crowberto :put 200 path
                                          {:members [{:test_type "card" :test_entity_id eid-a}
                                                     {:test_type "card" :test_id test-b}]})))
            (is (= [[:card eid-a]] (do (mt/user-http-request :crowberto :put 200 path
                                                             {:members [{:test_type "card" :test_id test-a}]})
                                       (data-testing.test-util/member-refs (:id created))))))
          (testing "DELETE removes the suite and its members"
            (mt/user-http-request :crowberto :delete 204 path)
            (is (not (t2/exists? :model/TestSuite :id (:id created))))
            (is (= [] (data-testing.test-util/member-refs (:id created))))
            (mt/user-http-request :crowberto :get 404 path))
          (finally
            (t2/delete! :model/TestSuite :id (:id created))))))))

(deftest refused-members-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-temp [:model/Card      {card-id :id}             {}
                   :model/CardTest  {test-id :id
                                     eid     :entity_id}      {:card_id card-id}
                   :model/TestSuite {suite-id :id}            {}]
      (let [missing-id (inc (t2/select-one-fn :max-id [:model/CardTest [[:max :id] :max-id]]))
            path       (str "ee/test-suite/" suite-id)
            suites     (t2/count :model/TestSuite)]
        (testing "a test id that names no test is refused"
          (mt/user-http-request :crowberto :post 400 "ee/test-suite"
                                {:name "s" :members [{:test_type "card" :test_id missing-id}]})
          (mt/user-http-request :crowberto :put 400 path {:members [{:test_type "card" :test_id missing-id}]}))
        (testing "an entity id that names no test and no member of the suite is refused"
          (mt/user-http-request :crowberto :put 400 path {:members [{:test_type "card" :test_entity_id (u/generate-nano-id)}]}))
        (testing "a test of another type with the same entity id is a different test"
          (mt/user-http-request :crowberto :put 400 path {:members [{:test_type "transform" :test_entity_id eid}]}))
        (testing "a test named once by id and once by entity id is refused as a duplicate"
          (mt/user-http-request :crowberto :put 400 path {:members [{:test_type "card" :test_id test-id}
                                                                    {:test_type "card" :test_entity_id eid}]}))
        (testing "a member with both an id and an entity id is refused"
          (mt/user-http-request :crowberto :put 400 path {:members [{:test_type "card" :test_id test-id :test_entity_id eid}]}))
        (testing "nothing was written: no suite was created, and no member was written to the suite"
          (is (= suites (t2/count :model/TestSuite)))
          (is (= [] (data-testing.test-util/member-refs suite-id))))))))

(deftest missing-members-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-temp [:model/Card      {card-id :id}        {}
                   :model/CardTest  {test-id :id}        {:card_id card-id}
                   :model/TestSuite {suite-id :id}       {}]
      ;; A suite pulled from git can name a test this instance lacks.
      (let [missing-eid (u/generate-nano-id)
            path        (str "ee/test-suite/" suite-id)]
        (t2/insert! :model/TestSuiteMember {:suite_id suite-id :test_type :card :test_entity_id missing-eid :position 0})
        (testing "a member that names no test is reported as missing, by type and entity id only"
          (is (= [{:test_type "card" :test_entity_id missing-eid :position 0 :status "missing"}]
                 (:members (mt/user-http-request :crowberto :get 200 path)))))
        (testing "an update can keep the missing member by its entity id"
          (is (=? {:members [{:status "missing" :test_entity_id missing-eid} {:status "readable" :test_id test-id}]}
                  (mt/user-http-request :crowberto :put 200 path
                                        {:members [{:test_type "card" :test_entity_id missing-eid}
                                                   {:test_type "card" :test_id test-id}]}))))))))

(deftest permissions-test
  (mt/with-premium-features data-testing.test-util/data-analyst-features
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {coll-id :id}        {}
                     :model/Collection {hidden-coll-id :id} {}
                     :model/Card       {card-id :id}        {:collection_id coll-id}
                     :model/Card       {hidden-card-id :id} {:collection_id hidden-coll-id}
                     :model/CardTest   {test-id :id
                                        eid     :entity_id}  {:card_id card-id :name "Readable"}
                     :model/CardTest   {hidden-id :id
                                        hidden-eid :entity_id} {:card_id hidden-card-id :name "Hidden"}
                     :model/TestSuite  {suite-id :id}       {:name "Suite"}]
        (t2/insert! :model/TestSuiteMember [{:suite_id suite-id :test_type :card :test_entity_id eid :position 0}
                                            {:suite_id suite-id :test_type :card :test_entity_id hidden-eid :position 1}])
        (perms/grant-collection-read-permissions! (perms-group/all-users) coll-id)
        (let [path (str "ee/test-suite/" suite-id)]
          (testing "a user who cannot enter Data Studio is refused by every CRUD endpoint"
            (doseq [request [[:get 403 "ee/test-suite"]
                             [:post 403 "ee/test-suite" {:name "s" :members []}]
                             [:get 403 path]
                             [:put 403 path {:name "t"}]
                             [:delete 403 path]]]
              (apply mt/user-http-request :rasta request)))
          (mt/with-data-analyst-role! (mt/user->id :lucky)
            (testing "a member the user cannot read is shown by type and entity id only"
              (is (= [{:test_type "card" :test_entity_id eid :test_id test-id :name "Readable"
                       :position 0 :status "readable"}
                      {:test_type "card" :test_entity_id hidden-eid :position 1 :status "unreadable"}]
                     (:members (mt/user-http-request :lucky :get 200 path)))))
            (testing "the list shows the same"
              (is (= ["unreadable"]
                     (->> (mt/user-http-request :lucky :get 200 "ee/test-suite")
                          (filter #(= suite-id (:id %)))
                          first :members (keep #(when (= hidden-eid (:test_entity_id %)) (:status %)))))))
            (testing "a test the user cannot read cannot be added by id, and the refusal does not say it exists"
              (let [missing-id (inc (t2/select-one-fn :max-id [:model/CardTest [[:max :id] :max-id]]))]
                (is (= (mt/user-http-request :lucky :put 400 path {:members [{:test_type "card" :test_id missing-id}]})
                       (-> (mt/user-http-request :lucky :put 400 path {:members [{:test_type "card" :test_id hidden-id}]})
                           (str/replace (str hidden-id) (str missing-id)))))))
            (testing "an update can keep a member the user cannot read, by its entity id"
              (is (=? {:name    "Edited"
                       :members [{:status "unreadable" :test_entity_id hidden-eid}]}
                      (mt/user-http-request :lucky :put 200 path
                                            {:name    "Edited"
                                             :members [{:test_type "card" :test_entity_id hidden-eid}]}))))
            (testing "a Data Studio user may delete the suite"
              (mt/user-http-request :lucky :delete 204 path)
              (is (not (t2/exists? :model/TestSuite :id suite-id))))))))))

(defn- put-members-concurrently!
  "PUT `first-members` and then `second-members` to `path`, as crowberto. The first request's transaction stays open
  until the second request has waited a second inside `update-test-suite!`. Returns the status and error message of
  both responses, and whether the second request was still waiting when the first was released."
  [path first-members second-members]
  (let [original       (mt/original-fn #'test-suite/update-test-suite!)
        calls          (atom 0)
        first-wrote    (promise)
        second-entered (promise)
        release        (promise)
        put!           #(let [{:keys [status body]} (mt/user-http-request-full-response :crowberto :put path {:members %})]
                          {:status status :message (:message body)})]
    (mt/with-dynamic-fn-redefs [test-suite/update-test-suite!
                                (fn [& args]
                                  (if (= 1 (swap! calls inc))
                                    (t2/with-transaction [_conn]
                                      (u/prog1 (apply original args)
                                        (deliver first-wrote true)
                                        (deref release 30000 nil)))
                                    (do (deliver second-entered true)
                                        (apply original args))))]
      (let [first-response  (future (put! first-members))
            _               (deref first-wrote 30000 nil)
            second-response (future (put! second-members))
            _               (deref second-entered 30000 nil)
            _               (Thread/sleep 1000)
            second-waited?  (not (realized? second-response))]
        (deliver release true)
        {:first          (deref first-response 30000 :timeout)
         :second         (deref second-response 30000 :timeout)
         :second-waited? second-waited?}))))

(deftest concurrent-member-updates-test
  ;; Postgres only: how the second request waits on the first depends on the app DB's locking.
  ;; Global values: each request needs its own connection and transaction, so the fixtures must be committed.
  (when (= :postgres (mdb/db-type))
    (mt/test-helpers-set-global-values!
      (mt/with-premium-features #{:transforms-testing}
        (mt/with-temp [:model/Card     {card-id :id}                 {}
                       :model/CardTest {test-a :id eid-a :entity_id} {:card_id card-id :name "A"}
                       :model/CardTest {test-b :id eid-b :entity_id} {:card_id card-id :name "B"}
                       :model/CardTest {test-c :id eid-c :entity_id} {:card_id card-id :name "C"}
                       :model/CardTest {test-d :id eid-d :entity_id} {:card_id card-id :name "D"}]
          (let [ref       (fn [test-id] {:test_type "card" :test_id test-id})
                suite-ids (atom [])
                new-suite (fn []
                            (u/prog1 (:id (mt/user-http-request :crowberto :post 200 "ee/test-suite"
                                                                {:name "Concurrent" :members [(ref test-a)]}))
                              (swap! suite-ids conj <>)))]
            (try
              (doseq [[case-name first-ids second-ids expected-eids]
                      [["lists with no test in common" [test-a test-b] [test-c test-d] [eid-c eid-d]]
                       ["lists that share a test"      [test-a test-b] [test-b test-a] [eid-b eid-a]]]
                      :let [expected (mapv (partial vector :card) expected-eids)]]
                (testing case-name
                  (testing "one PUT after the other leaves the second list"
                    (let [suite-id (new-suite)
                          path     (str "ee/test-suite/" suite-id)]
                      (mt/user-http-request :crowberto :put 200 path {:members (map ref first-ids)})
                      (mt/user-http-request :crowberto :put 200 path {:members (map ref second-ids)})
                      (is (= expected (data-testing.test-util/member-refs suite-id)))))
                  (testing "two concurrent PUTs both succeed, and the second replaces the first"
                    (let [suite-id  (new-suite)
                          responses (put-members-concurrently! (str "ee/test-suite/" suite-id)
                                                               (map ref first-ids)
                                                               (map ref second-ids))]
                      (is (:second-waited? responses))
                      (is (=? {:status 200} (:first responses)))
                      (is (=? {:status 200} (:second responses)))
                      (is (= expected (data-testing.test-util/member-refs suite-id)))))))
              (finally
                (t2/delete! :model/TestSuite :id [:in @suite-ids])))))))))

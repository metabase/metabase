(ns metabase-enterprise.data-testing.suite-api-test
  "`/api/ee/test-suite`."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.data-testing.test-util :as data-testing.test-util]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn- member-rows
  "The member rows of the suite `suite-id`, in order, as `[test-type test-entity-id]`."
  [suite-id]
  (into [] (t2/select-fn-vec (juxt :test_type :test_entity_id) :model/TestSuiteMember
                             {:where [:= :suite_id suite-id] :order-by [[:position :asc]]})))

(deftest premium-feature-test
  (testing "every endpoint refuses an instance without the feature"
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
                                       (member-rows (:id created))))))
          (testing "DELETE removes the suite and its members"
            (mt/user-http-request :crowberto :delete 204 path)
            (is (not (t2/exists? :model/TestSuite :id (:id created))))
            (is (= [] (member-rows (:id created))))
            (mt/user-http-request :crowberto :get 404 path))
          (finally
            (t2/delete! :model/TestSuite :id (:id created))))))))

(deftest refused-members-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-temp [:model/Card      {card-id :id}             {}
                   :model/CardTest  {test-id :id
                                     eid     :entity_id}      {:card_id card-id}
                   :model/TestSuite {suite-id :id}            {}]
      (let [missing-id (inc (t2/select-one-fn :max-id [:model/CardTest [:%max.id :max-id]]))
            path       (str "ee/test-suite/" suite-id)]
        (testing "a test id that names no test is refused"
          (mt/user-http-request :crowberto :post 400 "ee/test-suite"
                                {:name "s" :members [{:test_type "card" :test_id missing-id}]})
          (mt/user-http-request :crowberto :put 400 path {:members [{:test_type "card" :test_id missing-id}]}))
        (testing "an entity id that names no test and no member of the suite is refused"
          (mt/user-http-request :crowberto :put 400 path {:members [{:test_type "card" :test_entity_id (u/generate-nano-id)}]}))
        (testing "a test of another type with the same id is a different test"
          (mt/user-http-request :crowberto :put 400 path {:members [{:test_type "transform" :test_entity_id eid}]}))
        (testing "a test given twice is refused, by id or by entity id"
          (mt/user-http-request :crowberto :put 400 path {:members [{:test_type "card" :test_id test-id}
                                                                    {:test_type "card" :test_entity_id eid}]}))
        (testing "a member with both an id and an entity id is refused"
          (mt/user-http-request :crowberto :put 400 path {:members [{:test_type "card" :test_id test-id :test_entity_id eid}]}))
        (testing "nothing was written"
          (is (= [] (member-rows suite-id))))))))

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
          (testing "a user who cannot enter Data Studio is refused by every endpoint"
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
              (let [missing-id (inc (t2/select-one-fn :max-id [:model/CardTest [:%max.id :max-id]]))]
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

(ns metabase-enterprise.data-testing.suite-remote-sync-test
  "Remote sync of test suites: every suite syncs, with its members, and a pulled suite can name tests this instance
  lacks."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.test-util :as remote-sync.tu]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- add-members!
  "Make `refs`, `[test-type entity-id]` pairs, the members of the suite `suite-id`, in order."
  [suite-id refs]
  (t2/insert! :model/TestSuiteMember (map-indexed (fn [i [test-type eid]]
                                                    {:suite_id suite-id :test_type test-type :test_entity_id eid :position i})
                                                  refs)))

(defn- member-refs
  "The members of the suite with entity id `suite-eid`, in order, as `[test-type entity-id]`."
  [suite-eid]
  (let [suite-id (t2/select-one-pk :model/TestSuite :entity_id suite-eid)]
    (into [] (t2/select-fn-vec (juxt :test_type :test_entity_id) :model/TestSuiteMember
                               {:where [:= :suite_id suite-id] :order-by [[:position :asc]]}))))

(deftest push-writes-every-suite-with-its-members-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-temp [:model/Collection unsynced {:name "Unsynced" :location "/"}
                     :model/Card       card     {:name "Unsynced card" :collection_id (:id unsynced)}
                     :model/CardTest   t        {:card_id (:id card) :name "Unsynced test"}
                     :model/TestSuite  suite    {:name "Nightly checks"}]
        (let [missing-eid (u/generate-nano-id)]
          (add-members! (:id suite) [[:card (:entity_id t)] [:card missing-eid]])
          (is (=? {:status :success} (remote-sync.tu/push! url nil)))
          (let [path (remote-sync.tu/entity-path! url "main" suite)]
            (testing "a suite of tests that do not sync, or that are missing, is written under test_suites, by its name"
              (is (str/starts-with? path "test_suites/"))
              (is (str/ends-with? path "nightly_checks.yaml")))
            (testing "the file holds the members, in order, by type and entity id"
              (is (=? {:name    "Nightly checks"
                       :members [{:test_type "card" :test_entity_id (:entity_id t) :position 0}
                                 {:test_type "card" :test_entity_id missing-eid :position 1}]}
                      (yaml/parse-string (remote-sync.tu/read-file! url "main" path)))))))))))

(deftest pull-a-suite-naming-a-missing-test-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-model-cleanup [:model/TestSuite :model/TestSuiteRun]
        (mt/with-temp [:model/Card      card  {:name "Card"}
                       :model/CardTest  t     {:card_id (:id card) :name "Kept"}
                       :model/CardTest  other {:card_id (:id card) :name "Other"}
                       :model/TestSuite suite {:name "Nightly"}]
          (add-members! (:id suite) [[:card (:entity_id t)]])
          (let [{v1 :version} (remote-sync.tu/push! url nil)
                path          (remote-sync.tu/entity-path! url "main" suite)
                yaml-text     (remote-sync.tu/read-file! url "main" path)
                missing-eid   (u/generate-nano-id)]
            (is (str/includes? yaml-text "members:\n- position: 0\n") "premise: the file lists the member as the fixture expects")
            (testing "a pull that adds a member naming a test this instance lacks loads it, in the file's order"
              (remote-sync.tu/commit! url "main" {path (str/replace yaml-text
                                                                    "members:\n- position: 0\n"
                                                                    (str "members:\n"
                                                                         "- position: 0\n"
                                                                         "  test_entity_id: " missing-eid "\n"
                                                                         "  test_type: card\n"
                                                                         "- position: 1\n"))})
              (let [{v2 :version :as result} (remote-sync.tu/pull! url v1)]
                (is (=? {:status :success} result))
                (is (= [[:card missing-eid] [:card (:entity_id t)]] (member-refs (:entity_id suite))))
                (testing "and a run of the suite reports the missing member, which fails the suite"
                  (is (=? {:status  "failed"
                           :members [{:status "missing" :test_entity_id missing-eid} {:test_entity_id (:entity_id t)}]}
                          (mt/with-premium-features #{:transforms-testing :remote-sync}
                            (mt/user-http-request :crowberto :post 200 (str "ee/test-suite/" (:id suite) "/run"))))))
                (testing "a pull that swaps two members reorders them"
                  (let [pulled (remote-sync.tu/read-file! url "main" path)]
                    (remote-sync.tu/commit! url "main" {path (-> pulled
                                                                 (str/replace missing-eid "SWAP")
                                                                 (str/replace (:entity_id t) missing-eid)
                                                                 (str/replace "SWAP" (:entity_id t)))}))
                  (let [{v3 :version :as result} (remote-sync.tu/pull! url v2)]
                    (is (=? {:status :success} result))
                    (is (= [[:card (:entity_id t)] [:card missing-eid]] (member-refs (:entity_id suite))))
                    (testing "a pull that changes the members replaces them"
                      (remote-sync.tu/commit! url "main" {path (str/replace yaml-text (:entity_id t) (:entity_id other))})
                      (is (=? {:status :success} (remote-sync.tu/pull! url v3)))
                      (is (= [[:card (:entity_id other)]] (member-refs (:entity_id suite)))))))))))))))

(deftest member-changes-are-local-changes-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-temp [:model/Card      card  {:name "Card"}
                     :model/CardTest  t     {:card_id (:id card)}
                     :model/TestSuite suite {:name "Nightly"}]
        (let [{v1 :version} (remote-sync.tu/push! url nil)]
          (testing "adding a member to a pushed suite is a local update of the suite"
            (add-members! (:id suite) [[:card (:entity_id t)]])
            (is (= #{["update" :model/TestSuite "Nightly"]}
                   (into #{}
                         (map (juxt :status (comp first :key) (comp :name :entity :doc)))
                         (remote-sync.tu/local-changes! url v1))))))))))

(deftest read-only-suite-writes-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-temp [:model/TestSuite suite {:name "Nightly"}]
      (remote-sync.tu/with-remote-sync ["file:///nonexistent/remote-sync-test-suite" :read-only]
        (let [path (str "ee/test-suite/" (:id suite))]
          (testing "on a read-only instance, a superuser cannot create, update or delete a suite"
            (mt/user-http-request :crowberto :post 403 "ee/test-suite" {:name "New" :members []})
            (mt/user-http-request :crowberto :put 403 path {:name "Renamed"})
            (mt/user-http-request :crowberto :delete 403 path)
            (is (= "Nightly" (t2/select-one-fn :name :model/TestSuite :id (:id suite)))))
          (testing "but can read and run it"
            (mt/user-http-request :crowberto :get 200 path)
            (is (= "passed" (:status (mt/user-http-request :crowberto :post 200 (str path "/run")))))))))))

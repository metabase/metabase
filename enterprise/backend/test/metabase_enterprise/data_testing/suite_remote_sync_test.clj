(ns metabase-enterprise.data-testing.suite-remote-sync-test
  "Remote sync of test suites: every suite syncs, with its members, and a pulled suite can name tests this instance
  lacks."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.data-testing.test-util :as data-testing.test-util]
   [metabase-enterprise.remote-sync.test-util :as remote-sync.tu]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest push-writes-every-suite-with-its-members-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-temp [:model/Collection unsynced {:name "Unsynced" :location "/"}
                     :model/Card       card     {:name "Unsynced card" :collection_id (:id unsynced)}
                     :model/CardTest   t        {:card_id (:id card) :name "Unsynced test"}
                     :model/TestSuite  suite    {:name "Nightly checks"}]
        (let [missing-eid (u/generate-nano-id)]
          (data-testing.test-util/add-members! (:id suite) [[:card (:entity_id t)] [:card missing-eid]])
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
          (data-testing.test-util/add-members! (:id suite) [[:card (:entity_id t)]])
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
                (is (= [[:card missing-eid] [:card (:entity_id t)]] (data-testing.test-util/member-rows (:id suite))))
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
                    (is (= [[:card (:entity_id t)] [:card missing-eid]] (data-testing.test-util/member-rows (:id suite))))
                    (testing "a pull that changes the members replaces them"
                      (remote-sync.tu/commit! url "main" {path (str/replace yaml-text (:entity_id t) (:entity_id other))})
                      (is (=? {:status :success} (remote-sync.tu/pull! url v3)))
                      (is (= [[:card (:entity_id other)]] (data-testing.test-util/member-rows (:id suite)))))))))))))))

(deftest member-changes-are-local-changes-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-temp [:model/Card      card  {:name "Card"}
                     :model/CardTest  t     {:card_id (:id card)}
                     :model/TestSuite suite {:name "Nightly"}]
        (let [{v1 :version} (remote-sync.tu/push! url nil)]
          (testing "adding a member to a pushed suite is a local update of the suite"
            (data-testing.test-util/add-members! (:id suite) [[:card (:entity_id t)]])
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

(deftest pull-of-a-suite-keeps-its-member-rows-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-temp [:model/TestSuite suite {:name "Nightly" :description "Before"}]
        (let [a (u/generate-nano-id)
              b (u/generate-nano-id)
              _ (data-testing.test-util/add-members! (:id suite) [[:card a] [:transform b]])
              ids-before    (t2/select-fn-vec :id :model/TestSuiteMember {:where    [:= :suite_id (:id suite)]
                                                                          :order-by [[:position :asc]]})
              {v1 :version} (remote-sync.tu/push! url nil)
              path          (remote-sync.tu/entity-path! url "main" suite)]
          (remote-sync.tu/commit! url "main" {path (str/replace (remote-sync.tu/read-file! url "main" path)
                                                                "description: Before" "description: After")})
          (is (=? {:status :success} (remote-sync.tu/pull! url v1)))
          (is (= "After" (t2/select-one-fn :description :model/TestSuite :id (:id suite)))
              "premise: the pull loaded the suite")
          (testing "a pull that loads a suite with unchanged members keeps their content"
            (is (= [[:card a] [:transform b]] (data-testing.test-util/member-rows (:id suite)))))
          (testing "and keeps their rows"
            (is (= ids-before (t2/select-fn-vec :id :model/TestSuiteMember {:where    [:= :suite_id (:id suite)]
                                                                            :order-by [[:position :asc]]})))))))))

(defn- test-file-path!
  "The path of the YAML file of the test `t` at the tip of `main`, outside `test_suites/`, or nil. A suite file that
  names `t` also holds its entity id."
  [url t]
  (some #(when (and (not (str/starts-with? % "test_suites/"))
                    (str/includes? (remote-sync.tu/read-file! url "main" %) (str "\nentity_id: " (:entity_id t))))
           %)
        (remote-sync.tu/files! url "main")))

(deftest pull-deleting-a-member-test-keeps-the-member-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-model-cleanup [:model/TestSuite :model/CardTest :model/Card :model/Collection]
        (mt/with-temp [:model/Collection synced {:name "Synced" :is_remote_synced true :location "/"}
                       :model/Card       card   {:name "Synced card" :collection_id (:id synced)}
                       :model/CardTest   t      {:card_id (:id card) :name "Synced test"}
                       :model/TestSuite  suite  {:name "Nightly"}]
          (data-testing.test-util/add-members! (:id suite) [[:card (:entity_id t)]])
          (let [{v1 :version :as pushed} (remote-sync.tu/push! url nil)
                test-path                (test-file-path! url t)]
            (is (=? {:status :success} pushed))
            (is (some? test-path) "premise: the card test was pushed to its own file")
            (remote-sync.tu/commit! url "main" {test-path nil})
            (let [{v2 :version :as pulled} (remote-sync.tu/pull! url v1)]
              (is (=? {:status :success} pulled))
              (is (not (t2/exists? :model/CardTest :id (:id t))) "premise: the pull deleted the card test")
              (testing "a pull that deletes a test the suite file still names keeps the member, as git has it"
                (is (= [[:card (:entity_id t)]] (data-testing.test-util/member-rows (:id suite)))))
              (testing "and leaves no local change"
                (is (empty? (map (juxt :status :key) (remote-sync.tu/local-changes! url v2))))))))))))

(deftest read-only-test-delete-keeps-synced-suite-members-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-temp [:model/Collection unsynced {:name "Unsynced" :location "/"}
                   :model/Card       card     {:name "Unsynced card" :collection_id (:id unsynced)}
                   :model/CardTest   t        {:card_id (:id card) :name "Unsynced test"}
                   :model/TestSuite  suite    {:name "Nightly"}]
      (data-testing.test-util/add-members! (:id suite) [[:card (:entity_id t)]])
      (remote-sync.tu/with-remote-sync ["file:///nonexistent/remote-sync-test-suite" :read-only]
        (mt/user-http-request :crowberto :put 403 (str "ee/test-suite/" (:id suite)) {:members []})
        (mt/user-http-request :crowberto :delete (str "ee/card-test/" (:id t)))
        (testing "on a read-only instance, deleting a test of an unsynced card leaves the suite's members unchanged"
          (is (= [[:card (:entity_id t)]] (data-testing.test-util/member-rows (:id suite)))))))))

(deftest pull-of-a-suite-naming-a-test-twice-is-refused-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-temp [:model/Card      card  {:name "Card"}
                     :model/CardTest  t     {:card_id (:id card)}
                     :model/TestSuite suite {:name "Nightly"}]
        (data-testing.test-util/add-members! (:id suite) [[:card (:entity_id t)]])
        (let [{v1 :version} (remote-sync.tu/push! url nil)
              path          (remote-sync.tu/entity-path! url "main" suite)
              yaml-text     (remote-sync.tu/read-file! url "main" path)
              member        (str "- position: 0\n  test_entity_id: " (:entity_id t) "\n  test_type: card\n")]
          (is (str/includes? yaml-text member) "premise: the file lists the member as the fixture expects")
          (remote-sync.tu/commit! url "main" {path (str/replace yaml-text member
                                                                (str member (str/replace member "position: 0" "position: 1")))})
          (let [result   (try (remote-sync.tu/pull! url v1) (catch Exception e e))
                messages (str/join "\n" (if (instance? Throwable result)
                                          (keep ex-message (take-while some? (iterate ex-cause result)))
                                          [(pr-str result)]))]
            (testing "a pull of a suite file that names one test twice fails, naming the suite and the test"
              (is (not= :success (:status result)))
              (is (str/includes? messages "\"Nightly\" names the same test more than once"))
              (is (str/includes? messages (str "card test " (:entity_id t)))))
            (testing "and leaves the suite as it was"
              (is (= [[:card (:entity_id t)]] (data-testing.test-util/member-rows (:id suite)))))))))))

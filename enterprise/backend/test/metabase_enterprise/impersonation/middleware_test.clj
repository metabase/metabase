(ns metabase-enterprise.impersonation.middleware-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.impersonation.db :as impersonation.db]
   [metabase-enterprise.impersonation.util-test :as impersonation.util-test]
   [metabase.collections.models.collection :as collection]
   [metabase.driver.util :as driver.u]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.permissions.core :as perms]
   [metabase.query-permissions.core :as query-perms]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- mp
  "The provider of the test Database, shared within a bound metadata provider cache."
  []
  (lib-be/application-database-metadata-provider (mt/id)))

(defn- policy-reads
  "How many times `thunk` reads whether a Database has impersonation policies."
  [thunk]
  (let [reads (atom 0)
        read  (mt/original-fn #'impersonation.db/impersonation-exists-for-database?)]
    (mt/with-dynamic-fn-redefs [impersonation.db/impersonation-exists-for-database? (fn [database-id]
                                                                                      (swap! reads inc)
                                                                                      (read database-id))]
      (thunk))
    @reads))

(defn- impersonation-supported
  "Calls `thunk` with the test Database's driver reported to support connection impersonation."
  [thunk]
  (let [supports? (mt/original-fn #'driver.u/supports?)]
    (mt/with-dynamic-fn-redefs [driver.u/supports? (fn [driver feature database]
                                                     (or (= feature :connection-impersonation)
                                                         (supports? driver feature database)))]
      (thunk))))

(defn- impersonated!
  "Calls `thunk` as rasta, impersonated on the test Database."
  [thunk]
  (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                 :attributes     {"impersonation_attr" "role_a"}}
    (mt/with-test-user :rasta
      (thunk))))

(defn- outcome
  "What preprocessing `query` gives: the role it assigns, or the message it is refused with."
  [query]
  (try
    [:role (:impersonation/role (qp.preprocess/preprocess query))]
    (catch clojure.lang.ExceptionInfo e
      [:refused (ex-message e)])))

(deftest native-query-validated-after-earlier-run-in-same-cache-test
  (testing "a policy created after an earlier query of the Database in the same provider cache still validates"
    (mt/with-premium-features #{:advanced-permissions}
      (impersonation-supported
       (fn []
         (let [fresh (lib-be/with-metadata-provider-cache
                       (impersonated! #(outcome (lib/native-query (mp) "SELECT 1; SELECT 2"))))]
           (is (= :refused (first fresh)))
           (lib-be/with-metadata-provider-cache
             (mt/with-test-user :rasta
               (outcome (lib/native-query (mp) "SELECT 1; SELECT 2")))
             (is (= fresh (impersonated! #(outcome (lib/native-query (mp) "SELECT 1; SELECT 2"))))))))))))

(deftest native-stages-validated-test
  (testing "a native source card and a native join stage are validated"
    (mt/with-premium-features #{:advanced-permissions}
      (impersonation-supported
       (fn []
         (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/native-query (mp) "SELECT 1; SELECT 2")}]
           (impersonated!
            (fn []
              (is (= :refused (first (outcome (lib/query (mp) (lib.metadata/card (mp) card-id))))))
              (is (= :refused (first (outcome (lib/join (lib/query (mp) (lib.metadata/table (mp) (mt/id :venues)))
                                                        (lib/join-clause (lib.metadata/card (mp) card-id)
                                                                         [(lib/= 1 1)]))))))))))))))

(deftest policy-read-only-for-native-queries-test
  (testing "with policies on the Database, an MBQL query reads none and keeps its role, and a native query reads them once"
    (mt/with-premium-features #{:advanced-permissions}
      (impersonation-supported
       (fn []
         (impersonated!
          (fn []
            (let [mbql   (lib/query (mp) (lib.metadata/table (mp) (mt/id :venues)))
                  native (lib/native-query (mp) "SELECT * FROM VENUES")
                  role   (atom nil)]
              (is (= 0 (policy-reads #(reset! role (outcome mbql)))))
              (is (= [:role "role_a"] @role))
              (is (= 1 (policy-reads #(outcome native))))))))))))

(deftest permission-answers-statement-count-test
  (testing "with advanced permissions, more MBQL Cards and queries on distinct Tables take as many statements, as a non-admin"
    (mt/with-premium-features #{:advanced-permissions}
      (mt/with-model-cleanup [:model/Collection :model/Card]
        (let [{coll-id :id :as coll} (first (collection/create-collections! [{:name (mt/random-name) :location "/"}]))]
          (perms/grant-collection-read-permissions! (perms/all-users-group) coll)
          (let [tables  [:venues :checkins :users :categories :orders :people :products :reviews]
                cards   (t2/insert-returning-instances!
                         :model/Card
                         (for [table tables]
                           {:name                   (name table)
                            :display                :table
                            :visualization_settings {}
                            :creator_id             (mt/user->id :crowberto)
                            :collection_id          coll-id
                            :dataset_query          (lib/query (mt/metadata-provider)
                                                               (lib.metadata/table (mt/metadata-provider) (mt/id table)))}))
                counts  (fn [cards]
                          (let [rows (t2/select :model/Card :id [:in (map :id cards)])]
                            [(t2/with-call-count [call-count]
                               (t2/hydrate rows :can_query)
                               (call-count))
                             (t2/with-call-count [call-count]
                               (query-perms/query-run-answers (mapv :dataset_query rows))
                               (call-count))]))
                natives (fn [table-keys]
                          (let [queries (mapv #(lib/native-query (mt/metadata-provider) (str "SELECT COUNT(*) FROM " (name %)))
                                              table-keys)]
                            (t2/with-call-count [call-count]
                              (query-perms/query-run-answers queries)
                              (call-count))))]
            (mt/with-test-user :rasta
              (counts (take 2 (drop 6 cards)))
              (is (= (counts (take 2 cards))
                     (counts (take 6 (drop 2 cards)))))
              (testing "while each native query still reads the policies of its Database"
                (natives (take 2 (drop 6 tables)))
                (is (= (+ (natives (take 2 tables)) 4)
                       (natives (take 6 (drop 2 tables)))))))))))))

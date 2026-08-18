(ns metabase-enterprise.sandbox.models.sandbox-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.sandbox.models.sandbox :as sandboxes]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest disallow-changing-table-id-test
  (testing "You can't change the table_id of a sandbox after it has been created."
    (mt/with-temp [:model/Sandbox gtap {:table_id (mt/id :venues)
                                        :group_id (u/the-id (perms-group/all-users))}]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"You cannot change the table ID of a sandbox once it has been created"
           (t2/update! :model/Sandbox (:id gtap) {:table_id (mt/id :checkins)}))))))

(deftest disallow-queries-that-add-columns-test
  (testing "Don't allow saving a Sandboxing query that contains columns not in the Table it replaces (#13715)"
    (doseq [[msg f] {"Create a new GTAP"
                     (fn [query]
                       (mt/with-temp [:model/Card                   card {:dataset_query   query
                                                                          :result_metadata (qp.preprocess/query->expected-cols query)}
                                      :model/Sandbox _    {:table_id (mt/id :venues)
                                                           :group_id (u/the-id (perms-group/all-users))
                                                           :card_id  (:id card)}]
                         :ok))

                     "Update an existing GTAP"
                     (fn [query]
                       (mt/with-temp [:model/Card                   card {:dataset_query   query
                                                                          :result_metadata (qp.preprocess/query->expected-cols query)}
                                      :model/Sandbox gtap {:table_id (mt/id :venues)
                                                           :group_id (u/the-id (perms-group/all-users))}]
                         (t2/update! :model/Sandbox (:id gtap) {:card_id (:id card)})
                         :ok))

                     "Update query for Card associated with an existing GTAP"
                     (fn [query]
                       (mt/with-temp [:model/Card                   card {:dataset_query   (mt/mbql-query venues)
                                                                          :result_metadata (qp.preprocess/query->expected-cols (mt/mbql-query venues))}
                                      :model/Sandbox _    {:table_id (mt/id :venues)
                                                           :group_id (u/the-id (perms-group/all-users))
                                                           :card_id  (:id card)}]
                         (t2/update! :model/Card (:id card) {:dataset_query query})
                         :ok))}]
      (testing (str "\n" msg "\n")
        (testing "sanity check"
          (is (= :ok
                 (f (mt/mbql-query venues)))))
        (testing "removing columns = ok"
          (is (= :ok
                 (f (mt/mbql-query venues {:fields [$id $name]})))))
        (testing "changing order of columns = ok"
          (is (= :ok
                 (f (mt/mbql-query venues
                      {:fields (for [id (shuffle (map :id (qp.preprocess/query->expected-cols (mt/mbql-query venues))))]
                                 [:field id nil])})))))))))

(deftest disallow-queries-that-change-types-test
  (testing "Don't allow saving a Sandboxing query that changes the type of a column vs. the type in the Table it replaces (#13715)"
    (mt/with-premium-features #{:sandboxes}
      (doseq [[msg f] {"Create a new GTAP"
                       (fn [metadata]
                         (mt/with-temp [:model/Card                   card {:dataset_query   (mt/mbql-query venues)
                                                                            :result_metadata metadata}
                                        :model/Sandbox _    {:table_id (mt/id :venues)
                                                             :group_id (u/the-id (perms-group/all-users))
                                                             :card_id  (:id card)}]
                           :ok))

                       "Update an existing GTAP"
                       (fn [metadata]
                         (mt/with-temp [:model/Card                   card {:dataset_query   (mt/mbql-query venues)
                                                                            :result_metadata metadata}
                                        :model/Sandbox gtap {:table_id (mt/id :venues)
                                                             :group_id (u/the-id (perms-group/all-users))}]
                           (t2/update! :model/Sandbox (:id gtap) {:card_id (:id card)})
                           :ok))

                       "Update query for Card associated with an existing GTAP"
                       (fn [metadata]
                         (mt/with-temp [:model/Card                   card {:dataset_query   (mt/mbql-query venues)
                                                                            :result_metadata (qp.preprocess/query->expected-cols (mt/mbql-query venues))}
                                        :model/Sandbox _    {:table_id (mt/id :venues)
                                                             :group_id (u/the-id (perms-group/all-users))
                                                             :card_id  (:id card)}]
                           (t2/update! :model/Card (:id card) {:result_metadata metadata})
                           :ok))}]
        (testing (str "\n" msg "\n")
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"Sandbox Questions can't return columns that have different types than the Table they are sandboxing"
               (f (-> (vec (qp.preprocess/query->expected-cols (mt/mbql-query venues)))
                      (assoc-in [0 :base_type] :type/Text)))))
          (testing "type changes to a descendant type = ok"
            (is (= :ok
                   (f
                    (-> (vec (qp.preprocess/query->expected-cols (mt/mbql-query venues)))
                        (assoc-in [0 :base_type] :type/BigInteger)))))))))))

(deftest add-sandboxes-to-permissions-graph-test
  (mt/with-premium-features #{:sandboxes}
    (mt/with-full-data-perms-for-all-users!
      (testing "Sandbox definitions in the DB are automatically added to the permissions graph"
        (mt/with-temp [:model/Sandbox _gtap {:table_id (mt/id :venues)
                                             :group_id (u/the-id (perms-group/all-users))}]
          (is (partial=
               {(u/the-id (perms-group/all-users))
                {(mt/id)
                 {:view-data
                  {"PUBLIC"
                   {(mt/id :venues) :sandboxed}}}}}
               (sandboxes/add-sandboxes-to-permissions-graph {})))))
      (testing "When perms are set at the DB level, incorporating a sandbox breaks them out to table-level"
        (mt/with-temp [:model/Sandbox _gtap {:table_id (mt/id :venues)
                                             :group_id (u/the-id (perms-group/all-users))}]
          (is (partial=
               {(u/the-id (perms-group/all-users))
                {(mt/id)
                 {:view-data {"PUBLIC"
                              {(mt/id :venues) :sandboxed}}}}}
               (sandboxes/add-sandboxes-to-permissions-graph
                {(u/the-id (perms-group/all-users))
                 {(mt/id)
                  {:view-data :unrestricted}}})))))
      (testing "When perms are set at the schema level, incorporating a sandbox breaks them out to table-level"
        (mt/with-temp [:model/Sandbox _gtap {:table_id (mt/id :venues)
                                             :group_id (u/the-id (perms-group/all-users))}]
          (is (partial=
               {(u/the-id (perms-group/all-users))
                {(mt/id)
                 {:view-data
                  {"PUBLIC"
                   {(mt/id :venues) :sandboxed}}}}}
               (sandboxes/add-sandboxes-to-permissions-graph
                {(u/the-id (perms-group/all-users))
                 {(mt/id)
                  {:view-data :unrestricted}}}))))))))

(deftest only-admins-can-change-a-card-a-sandbox-is-built-out-of-test
  (mt/with-premium-features #{:sandboxes}
    (mt/with-temp [:model/Card    {source-id :id} {:dataset_query (mt/mbql-query venues)}
                   :model/Card    {card-id :id}   {:dataset_query (mt/mbql-query nil {:source-table (str "card__" source-id)})}
                   :model/Card    {other-id :id}  {:dataset_query (mt/mbql-query venues)}
                   :model/Sandbox _               {:table_id (mt/id :venues)
                                                   :group_id (u/the-id (perms-group/all-users))
                                                   :card_id  card-id}]
      (mt/with-test-user :rasta
        (testing "a non-admin cannot rewrite the query of the Card a sandbox is built out of"
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"You do not have permissions to modify a question that is used for row and column level security"
               (t2/update! :model/Card card-id {:dataset_query (mt/mbql-query checkins)}))))
        (testing "nor of a Card that one reads, however deep"
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"You do not have permissions to modify a question that is used for row and column level security"
               (t2/update! :model/Card source-id {:dataset_query (mt/mbql-query checkins)}))))
        (testing "nor archive it, which would leave the sandbox filtering nothing"
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"You do not have permissions to modify a question that is used for row and column level security"
               (t2/update! :model/Card card-id {:archived true}))))
        (testing "nor delete it"
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"You do not have permissions to modify a question that is used for row and column level security"
               (t2/delete! :model/Card :id card-id))))
        (testing "a Card no sandbox is built out of is none of this check's business"
          (is (pos? (t2/update! :model/Card other-id {:dataset_query (mt/mbql-query checkins)})))))
      (testing "an admin may do it"
        (mt/with-test-user :crowberto
          (is (pos? (t2/update! :model/Card card-id {:dataset_query (mt/mbql-query venues {:fields [$id]})}))))))))

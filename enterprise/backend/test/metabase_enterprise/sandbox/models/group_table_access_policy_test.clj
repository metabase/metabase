(ns metabase-enterprise.sandbox.models.group-table-access-policy-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.sandbox.models.group-table-access-policy
    :as sandboxes
    :refer [GroupTableAccessPolicy]]
   [metabase.models :refer [Card]]
   [metabase.models.permissions-group :as perms-group]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest normalize-attribute-remappings-test
  (testing "make sure attribute-remappings come back from the DB normalized the way we'd expect"
    (t2.with-temp/with-temp [GroupTableAccessPolicy gtap {:table_id             (mt/id :venues)
                                                          :group_id             (u/the-id (perms-group/all-users))
                                                          :attribute_remappings {"venue_id"
                                                                                 {:type   "category"
                                                                                  :target ["variable" ["field" (mt/id :venues :id) nil]]
                                                                                  :value  5}}}]
      (is (= {"venue_id" {:type   :category
                          :target [:variable [:field (mt/id :venues :id) nil]]
                          :value  5}}
             (t2/select-one-fn :attribute_remappings GroupTableAccessPolicy :id (u/the-id gtap)))))

    (testing (str "apparently sometimes they are saved with just the target, but not type or value? Make sure these "
                  "get normalized correctly.")
      (t2.with-temp/with-temp [GroupTableAccessPolicy gtap {:table_id             (mt/id :venues)
                                                            :group_id             (u/the-id (perms-group/all-users))
                                                            :attribute_remappings {"user" ["variable" ["field" (mt/id :venues :id) nil]]}}]
        (is (= {"user" [:variable [:field (mt/id :venues :id) nil]]}
               (t2/select-one-fn :attribute_remappings GroupTableAccessPolicy :id (u/the-id gtap))))))))

(deftest disallow-changing-table-id-test
  (testing "You can't change the table_id of a GTAP after it has been created."
    (t2.with-temp/with-temp [GroupTableAccessPolicy gtap {:table_id (mt/id :venues)
                                                          :group_id (u/the-id (perms-group/all-users))}]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"You cannot change the Table ID of a GTAP once it has been created"
           (t2/update! GroupTableAccessPolicy (:id gtap) {:table_id (mt/id :checkins)}))))))

(deftest disallow-queries-that-add-columns-test
  (testing "Don't allow saving a Sandboxing query that contains columns not in the Table it replaces (#13715)"
    (doseq [[msg f] {"Create a new GTAP"
                     (fn [query]
                       (mt/with-temp [Card                   card {:dataset_query   query
                                                                   :result_metadata (qp.preprocess/query->expected-cols query)}
                                      GroupTableAccessPolicy _    {:table_id (mt/id :venues)
                                                                   :group_id (u/the-id (perms-group/all-users))
                                                                   :card_id  (:id card)}]
                         :ok))

                     "Update an existing GTAP"
                     (fn [query]
                       (mt/with-temp [Card                   card {:dataset_query   query
                                                                   :result_metadata (qp.preprocess/query->expected-cols query)}
                                      GroupTableAccessPolicy gtap {:table_id (mt/id :venues)
                                                                   :group_id (u/the-id (perms-group/all-users))}]
                         (t2/update! GroupTableAccessPolicy (:id gtap) {:card_id (:id card)})
                         :ok))

                     "Update query for Card associated with an existing GTAP"
                     (fn [query]
                       (mt/with-temp [Card                   card {:dataset_query   (mt/mbql-query venues)
                                                                   :result_metadata (qp.preprocess/query->expected-cols (mt/mbql-query venues))}
                                      GroupTableAccessPolicy _    {:table_id (mt/id :venues)
                                                                   :group_id (u/the-id (perms-group/all-users))
                                                                   :card_id  (:id card)}]
                         (t2/update! Card (:id card) {:dataset_query query})
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
                         (mt/with-temp [Card                   card {:dataset_query   (mt/mbql-query venues)
                                                                     :result_metadata metadata}
                                        GroupTableAccessPolicy _    {:table_id (mt/id :venues)
                                                                     :group_id (u/the-id (perms-group/all-users))
                                                                     :card_id  (:id card)}]
                           :ok))

                       "Update an existing GTAP"
                       (fn [metadata]
                         (mt/with-temp [Card                   card {:dataset_query   (mt/mbql-query venues)
                                                                     :result_metadata metadata}
                                        GroupTableAccessPolicy gtap {:table_id (mt/id :venues)
                                                                     :group_id (u/the-id (perms-group/all-users))}]
                           (t2/update! GroupTableAccessPolicy (:id gtap) {:card_id (:id card)})
                           :ok))

                       "Update query for Card associated with an existing GTAP"
                       (fn [metadata]
                         (mt/with-temp [Card                   card {:dataset_query   (mt/mbql-query venues)
                                                                     :result_metadata (qp.preprocess/query->expected-cols (mt/mbql-query venues))}
                                        GroupTableAccessPolicy _    {:table_id (mt/id :venues)
                                                                     :group_id (u/the-id (perms-group/all-users))
                                                                     :card_id  (:id card)}]
                           (t2/update! Card (:id card) {:result_metadata metadata})
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
        (mt/with-temp [GroupTableAccessPolicy _gtap {:table_id (mt/id :venues)
                                                     :group_id (u/the-id (perms-group/all-users))}]
          (is (partial=
               {(u/the-id (perms-group/all-users))
                {(mt/id)
                 {:view-data
                  {"PUBLIC"
                   {(mt/id :venues) :sandboxed}}}}}
               (sandboxes/add-sandboxes-to-permissions-graph {})))))

      (testing "When perms are set at the DB level, incorporating a sandbox breaks them out to table-level"
        (mt/with-temp [GroupTableAccessPolicy _gtap {:table_id (mt/id :venues)
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
        (mt/with-temp [GroupTableAccessPolicy _gtap {:table_id (mt/id :venues)
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

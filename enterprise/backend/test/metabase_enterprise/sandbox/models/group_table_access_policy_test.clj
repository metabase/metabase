(ns metabase-enterprise.sandbox.models.group-table-access-policy-test
  (:require [clojure.test :refer :all]
            [metabase
             [models :refer [Card]]
             [query-processor :as qp]
             [test :as mt]
             [util :as u]]
            [metabase-enterprise.sandbox.models.group-table-access-policy :refer [GroupTableAccessPolicy]]
            [metabase.models.permissions-group :as group]
            [toucan.db :as db]))

(deftest normalize-attribute-remappings-test
  (testing "make sure attribute-remappings come back from the DB normalized the way we'd expect"
    (mt/with-temp GroupTableAccessPolicy [gtap {:table_id             (mt/id :venues)
                                                :group_id             (u/get-id (group/all-users))
                                                :attribute_remappings {"venue_id"
                                                                       {:type   "category"
                                                                        :target ["variable" ["field-id" (mt/id :venues :id)]]
                                                                        :value  5}}}]
      (is (= {"venue_id" {:type   :category
                          :target [:variable [:field-id (mt/id :venues :id)]]
                          :value  5}}
             (db/select-one-field :attribute_remappings GroupTableAccessPolicy :id (u/get-id gtap)))))

    (testing (str "apparently sometimes they are saved with just the target, but not type or value? Make sure these "
                  "get normalized correctly.")
      (mt/with-temp GroupTableAccessPolicy [gtap {:table_id             (mt/id :venues)
                                                  :group_id             (u/get-id (group/all-users))
                                                  :attribute_remappings {"user" ["variable" ["field-id" (mt/id :venues :id)]]}}]
        (is (= {"user" [:variable [:field-id (mt/id :venues :id)]]}
               (db/select-one-field :attribute_remappings GroupTableAccessPolicy :id (u/get-id gtap))))))))

(deftest disallow-changing-table-id-test
  (testing "You can't change the table_id of a GTAP after it has been created."
    (mt/with-temp GroupTableAccessPolicy [gtap {:table_id (mt/id :venues)
                                                :group_id (u/get-id (group/all-users))}]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"You cannot change the Table ID of a GTAP once it has been created"
           (db/update! GroupTableAccessPolicy (:id gtap) :table_id (mt/id :checkins)))))))

(deftest disallow-queries-that-add-columns-test
  (testing "Don't allow saving a Sandboxing query that contains columns not in the Table it replaces (#13715)"
    (doseq [[msg f] {"Create a new GTAP"
                     (fn [query]
                       (mt/with-temp* [Card                   [card {:dataset_query   query
                                                                     :result_metadata (qp/query->expected-cols query)}]
                                       GroupTableAccessPolicy [gtap {:table_id (mt/id :venues)
                                                                     :group_id (u/get-id (group/all-users))
                                                                     :card_id  (:id card)}]]
                         :ok))

                     "Update an existing GTAP"
                     (fn [query]
                       (mt/with-temp* [Card                   [card {:dataset_query   query
                                                                     :result_metadata (qp/query->expected-cols query)}]
                                       GroupTableAccessPolicy [gtap {:table_id (mt/id :venues)
                                                                     :group_id (u/get-id (group/all-users))}]]
                         (db/update! GroupTableAccessPolicy (:id gtap) :card_id (:id card))
                         :ok))

                     "Update query for Card associated with an existing GTAP"
                     (fn [query]
                       (mt/with-temp* [Card                   [card {:dataset_query   (mt/mbql-query :venues)
                                                                     :result_metadata (qp/query->expected-cols (mt/mbql-query :venues))}]
                                       GroupTableAccessPolicy [gtap {:table_id (mt/id :venues)
                                                                     :group_id (u/get-id (group/all-users))
                                                                     :card_id  (:id card)}]]
                         (db/update! Card (:id card) :dataset_query query)
                         :ok))}]
      (testing (str "\n" msg "\n")
        (testing "sanity check"
          (is (= :ok
                 (f (mt/mbql-query venues)))))
        (testing "adding new columns = not ok"
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"Sandbox Cards can't return columns that arent present in the Table they are sandboxing"
               (f (mt/mbql-query checkins)))))
        (testing "removing columns = ok"
          (is (= :ok
                 (f (mt/mbql-query venues {:fields [$id $name]})))))
        (testing "changing order of columns = ok"
          (is (= :ok
                 (f (mt/mbql-query venues
                      {:fields (for [id (shuffle (map :id (qp/query->expected-cols (mt/mbql-query venues))))]
                                 [:field-id id])})))))))))

(deftest disallow-queries-that-change-types-test
  (testing "Don't allow saving a Sandboxing query that changes the type of a column vs. the type in the Table it replaces (#13715)"
    (doseq [[msg f] {"Create a new GTAP"
                     (fn [metadata]
                       (mt/with-temp* [Card                   [card {:dataset_query   (mt/mbql-query :venues)
                                                                     :result_metadata metadata}]
                                       GroupTableAccessPolicy [gtap {:table_id (mt/id :venues)
                                                                     :group_id (u/get-id (group/all-users))
                                                                     :card_id  (:id card)}]]
                         :ok))

                     "Update an existing GTAP"
                     (fn [metadata]
                       (mt/with-temp* [Card                   [card {:dataset_query   (mt/mbql-query :venues)
                                                                     :result_metadata metadata}]
                                       GroupTableAccessPolicy [gtap {:table_id (mt/id :venues)
                                                                     :group_id (u/get-id (group/all-users))}]]
                         (db/update! GroupTableAccessPolicy (:id gtap) :card_id (:id card))
                         :ok))

                     "Update query for Card associated with an existing GTAP"
                     (fn [metadata]
                       (mt/with-temp* [Card                   [card {:dataset_query   (mt/mbql-query :venues)
                                                                     :result_metadata (qp/query->expected-cols (mt/mbql-query :venues))}]
                                       GroupTableAccessPolicy [gtap {:table_id (mt/id :venues)
                                                                     :group_id (u/get-id (group/all-users))
                                                                     :card_id  (:id card)}]]
                         (db/update! Card (:id card) :result_metadata metadata)
                         :ok))}]
      (testing (str "\n" msg "\n")
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Sandbox Cards can't return columns that have different types than the Table they are sandboxing"
             (f (-> (vec (qp/query->expected-cols (mt/mbql-query venues)))
                    (assoc-in [0 :base_type] :type/Text)))))
        (testing "type changes to a descendant type = ok"
          (is (= :ok
                 (f
                  (-> (vec (qp/query->expected-cols (mt/mbql-query venues)))
                      (assoc-in [0 :base_type] :type/BigInteger))))))))))

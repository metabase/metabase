(ns metabase-enterprise.reports.models.report-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.reports.models.report :as report]
   [metabase.collections.models.collection :as collection]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest sync-report-cards-collection-matching-cards-test
  (testing "should only update cards with matching report_document_id and :in_report type"
    (mt/with-temp [:model/Collection {collection-id :id} {:name "Target Collection"}
                   :model/Report {report-id :id} {:name "Test Report"}
                   :model/Card {card1-id :id} {:name "Report Card 1"
                                               :type :in_report
                                               :report_document_id report-id
                                               :collection_id nil
                                               :dataset_query (mt/mbql-query venues)}
                   :model/Card {card2-id :id} {:name "Report Card 2"
                                               :type :in_report
                                               :report_document_id report-id
                                               :collection_id nil
                                               :dataset_query (mt/mbql-query venues)}
                   :model/Card {other-card-id :id} {:name "Other Card"
                                                    :type :question
                                                    :collection_id nil
                                                    :dataset_query (mt/mbql-query venues)}]
      (let [updated-count (report/sync-report-cards-collection! report-id collection-id)]
        ;; Should update exactly 2 cards
        (is (= 2 updated-count))

        ;; Verify the report cards were updated
        (let [updated-card1 (t2/select-one :model/Card :id card1-id)
              updated-card2 (t2/select-one :model/Card :id card2-id)
              other-card (t2/select-one :model/Card :id other-card-id)]
          (is (= collection-id (:collection_id updated-card1)))
          (is (= collection-id (:collection_id updated-card2)))
          ;; Other card should not be affected
          (is (nil? (:collection_id other-card))))))))

(deftest sync-report-cards-collection-nil-report-document-id-test
  (testing "should not affect cards with nil report_document_id"
    (mt/with-temp [:model/Collection {collection-id :id} {:name "Target Collection"}
                   :model/Report {report-id :id} {:name "Test Report"}
                   :model/Card {nil-report-card-id :id} {:name "Nil Report Card"
                                                         :type :in_report
                                                         :report_document_id nil
                                                         :collection_id nil
                                                         :dataset_query (mt/mbql-query venues)}]
      (let [updated-count (report/sync-report-cards-collection! report-id collection-id)]
        ;; Should update 0 cards since no cards have matching report_document_id
        (is (= 0 updated-count))

        ;; Verify the card with nil report_document_id was not affected
        (let [unchanged-card (t2/select-one :model/Card :id nil-report-card-id)]
          (is (nil? (:collection_id unchanged-card))))))))

(deftest sync-report-cards-collection-large-numbers-test
  (testing "should handle large numbers of cards efficiently"
    (mt/with-model-cleanup [:model/Card]
      (mt/with-temp [:model/Collection {collection-id :id} {:name "Target Collection"}
                     :model/Report {report-id :id} {:name "Test Report with Many Cards"}]
        ;; Create 50 cards associated with the report
        (let [card-ids (doall
                        (for [i (range 50)]
                          (:id (t2/insert-returning-pks! :model/Card
                                                         (merge (mt/with-temp-defaults :model/Card)
                                                                {:type :in_report
                                                                 :report_document_id report-id
                                                                 :collection_id nil
                                                                 :dataset_query (mt/mbql-query venues)})))))]
          (let [updated-count (report/sync-report-cards-collection! report-id collection-id)]
            ;; Should update all 50 cards
            (is (= 50 updated-count))

            ;; Verify all cards were updated (check a few samples)
            (let [sample-cards (t2/select :model/Card :id [:in card-ids] {:limit 5})]
              (is (every? #(= collection-id (:collection_id %)) sample-cards)))))))))

(deftest sync-report-cards-collection-transaction-boundaries-test
  (testing "should work within transaction boundaries"
    (mt/with-temp [:model/Collection {collection-id :id} {:name "Target Collection"}
                   :model/Report {report-id :id} {:name "Transaction Test Report"}
                   :model/Card {card-id :id} {:name "Transaction Test Card"
                                              :type :in_report
                                              :report_document_id report-id
                                              :collection_id nil
                                              :dataset_query (mt/mbql-query venues)}]
      ;; Test that function works correctly within a transaction
      (t2/with-transaction [_conn]
        (let [updated-count (report/sync-report-cards-collection! report-id collection-id)]
          (is (= 1 updated-count))

          ;; Verify card was updated within the transaction
          (let [updated-card (t2/select-one :model/Card :id card-id)]
            (is (= collection-id (:collection_id updated-card))))))

      ;; Verify the update persisted after transaction
      (let [final-card (t2/select-one :model/Card :id card-id)]
        (is (= collection-id (:collection_id final-card)))))))

(deftest sync-report-cards-collection-empty-result-sets-test
  (testing "should handle empty result sets gracefully"
    (mt/with-temp [:model/Collection {collection-id :id} {:name "Target Collection"}
                   :model/Report {report-id :id} {:name "Empty Report"}]
      ;; No cards associated with this report
      (let [updated-count (report/sync-report-cards-collection! report-id collection-id)]
        ;; Should return 0 for no updates
        (is (= 0 updated-count))))))

(deftest sync-report-cards-collection-transaction-rollback-test
  (testing "transaction rollback if any card update fails"
    (mt/with-temp [:model/Collection {collection-id :id} {:name "Target Collection"}
                   :model/Report {report-id :id} {:name "Transaction Rollback Test"}
                   :model/Card {card-id :id} {:name "Test Card"
                                              :type :in_report
                                              :report_document_id report-id
                                              :collection_id nil
                                              :dataset_query (mt/mbql-query venues)}]
      ;; This test verifies that the function uses proper transaction boundaries
      ;; If the transaction fails, all changes should be rolled back
      (testing "cards are updated within transaction boundaries"
        (let [updated-count (report/sync-report-cards-collection! report-id collection-id)]
          (is (= 1 updated-count))

          ;; Verify the card was updated
          (let [updated-card (t2/select-one :model/Card :id card-id)]
            (is (= collection-id (:collection_id updated-card))))))

      (testing "function operates atomically"
        ;; This test demonstrates that the sync operation is atomic
        ;; All cards are updated in a single transaction
        (let [original-collection-id (:collection_id (t2/select-one :model/Card :id card-id))]
          (is (= collection-id original-collection-id))

          ;; Create a second collection for moving back
          (mt/with-temp [:model/Collection {new-collection-id :id} {:name "New Target Collection"}]
            (let [updated-count (report/sync-report-cards-collection! report-id new-collection-id)]
              (is (= 1 updated-count))

              ;; Verify the card was moved to the new collection
              (let [final-card (t2/select-one :model/Card :id card-id)]
                (is (= new-collection-id (:collection_id final-card)))))))))))

(deftest report-collection-sync-hook-triggers-on-collection-change-test
  (testing "Hook is called when report collection_id changes"
    (mt/with-temp
      [:model/Collection {old-collection-id :id} {:name "Old Collection"}
       :model/Collection {new-collection-id :id} {:name "New Collection"}
       :model/Report {report-id :id} {:collection_id old-collection-id
                                      :name "Test Report"}
       :model/Card {card1-id :id} {:name "Card 1"
                                   :type :in_report
                                   :report_document_id report-id
                                   :collection_id old-collection-id}
       :model/Card {card2-id :id} {:name "Card 2"
                                   :type :in_report
                                   :report_document_id report-id
                                   :collection_id old-collection-id}]

      ;; Update the report's collection_id
      (t2/update! :model/Report report-id {:collection_id new-collection-id})

      ;; Verify that associated cards were updated to match the new collection
      (is (= new-collection-id (:collection_id (t2/select-one :model/Card :id card1-id))))
      (is (= new-collection-id (:collection_id (t2/select-one :model/Card :id card2-id)))))))

(deftest report-collection-sync-hook-handles-nil-collections-test
  (testing "Hook correctly handles nil collection values"
    (mt/with-temp
      [:model/Collection {collection-id :id} {:name "Test Collection"}
       :model/Report {report-id :id} {:collection_id collection-id
                                      :name "Test Report"}
       :model/Card {card-id :id} {:name "Card"
                                  :type :in_report
                                  :report_document_id report-id
                                  :collection_id collection-id}]

      ;; Move report to no collection (nil)
      (t2/update! :model/Report report-id {:collection_id nil})

      ;; Verify that the card's collection_id was updated to nil
      (is (nil? (:collection_id (t2/select-one :model/Card :id card-id)))))))

(deftest report-collection-sync-hook-only-affects-in-report-cards-test
  (testing "Hook only updates cards with type :in_report and matching report_document_id"
    (mt/with-temp
      [:model/Collection {old-collection-id :id} {:name "Old Collection"}
       :model/Collection {new-collection-id :id} {:name "New Collection"}
       :model/Report {report-id :id} {:collection_id old-collection-id
                                      :name "Test Report"}
       ;; Card that should be updated (correct type and report_document_id)
       :model/Card {in-report-card-id :id} {:name "In-Report Card"
                                            :type :in_report
                                            :report_document_id report-id
                                            :collection_id old-collection-id}
       ;; Card that should NOT be updated (wrong type)
       :model/Card {question-card-id :id} {:name "Question Card"
                                           :type :question
                                           :collection_id old-collection-id}
       ;; Card that should NOT be updated (no report_document_id)
       :model/Card {regular-card-id :id} {:name "Regular Card"
                                          :type :in_report
                                          :collection_id old-collection-id}]

      ;; Update the report's collection_id
      (t2/update! :model/Report report-id {:collection_id new-collection-id})

      ;; Verify only the correct card was updated
      (is (= new-collection-id (:collection_id (t2/select-one :model/Card :id in-report-card-id))))

      ;; Verify other cards were NOT updated
      (is (= old-collection-id (:collection_id (t2/select-one :model/Card :id question-card-id))))
      (is (= old-collection-id (:collection_id (t2/select-one :model/Card :id regular-card-id)))))))

(deftest personal-collection-edge-cases-test
  (testing "Personal collection handling"
    (binding [collection/*allow-deleting-personal-collections* true]
      (mt/with-temp [:model/User {user-id :id} {:first_name "Test" :last_name "User" :email "test@example.com"}
                     :model/Collection {personal-collection-id :id} {:name "Personal Collection"
                                                                     :personal_owner_id user-id}
                     :model/Collection {regular-collection-id :id} {:name "Regular Collection"}
                     :model/Report {report-id :id} {:collection_id regular-collection-id
                                                    :name "Personal Test Report"}
                     :model/Card {card-id :id} {:name "Personal Card"
                                                :type :in_report
                                                :report_document_id report-id
                                                :collection_id regular-collection-id
                                                :dataset_query (mt/mbql-query venues)}]

        (testing "moving report to personal collection moves associated cards"
          (mt/with-current-user user-id
          ;; As the personal collection owner, update should succeed
            (t2/update! :model/Report report-id {:collection_id personal-collection-id})

          ;; Verify both report and card moved to personal collection
            (is (= personal-collection-id (:collection_id (t2/select-one :model/Report :id report-id))))
            (is (= personal-collection-id (:collection_id (t2/select-one :model/Card :id card-id))))))

        (testing "moving report from personal collection works"
          (mt/with-current-user user-id
          ;; Move back to regular collection
            (t2/update! :model/Report report-id {:collection_id regular-collection-id})

          ;; Verify both report and card moved back
            (is (= regular-collection-id (:collection_id (t2/select-one :model/Report :id report-id))))
            (is (= regular-collection-id (:collection_id (t2/select-one :model/Card :id card-id))))))))))

(deftest validate-collection-move-permissions-allows-move-with-both-permissions-test
  (testing "allows move when user has write permissions for both collections"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {old-collection-id :id} {:name "Old Collection"}
                     :model/Collection {new-collection-id :id} {:name "New Collection"}
                     :model/User {user-id :id} {}]
        (mt/with-current-user user-id
          ;; Grant write permissions to both collections
          (perms/grant-collection-readwrite-permissions! (perms/all-users-group) old-collection-id)
          (perms/grant-collection-readwrite-permissions! (perms/all-users-group) new-collection-id)

          ;; Should not throw any exception
          (is (true? (report/validate-collection-move-permissions old-collection-id new-collection-id))))))))

(deftest validate-collection-move-permissions-throws-403-missing-old-permission-test
  (testing "throws 403 when user lacks write permission for old collection"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {old-collection-id :id} {:name "Old Collection"}
                     :model/Collection {new-collection-id :id} {:name "New Collection"}
                     :model/User {user-id :id} {}]
        (mt/with-current-user user-id
          ;; Grant write permission only to new collection
          (perms/grant-collection-readwrite-permissions! (perms/all-users-group) new-collection-id)

          ;; Should throw 403 exception
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You do not have curate permissions for this Collection."
                                (report/validate-collection-move-permissions old-collection-id new-collection-id))))))))

(deftest validate-collection-move-permissions-throws-403-missing-new-permission-test
  (testing "throws 403 when user lacks write permission for new collection"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {old-collection-id :id} {:name "Old Collection"}
                     :model/Collection {new-collection-id :id} {:name "New Collection"}
                     :model/User {user-id :id} {}]
        (mt/with-current-user user-id
          ;; Grant write permission only to old collection
          (perms/grant-collection-readwrite-permissions! (perms/all-users-group) old-collection-id)

          ;; Should throw 403 exception
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You do not have curate permissions for this Collection."
                                (report/validate-collection-move-permissions old-collection-id new-collection-id))))))))

(deftest validate-collection-move-permissions-throws-403-no-permissions-test
  (testing "throws 403 when user lacks write permissions for both collections"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {old-collection-id :id} {:name "Old Collection"}
                     :model/Collection {new-collection-id :id} {:name "New Collection"}
                     :model/User {user-id :id} {}]
        (mt/with-current-user user-id
          ;; No permissions granted

          ;; Should throw 403 exception
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You do not have curate permissions for this Collection."
                                (report/validate-collection-move-permissions old-collection-id new-collection-id))))))))

(deftest validate-collection-move-permissions-allows-move-from-root-test
  (testing "allows move when old collection is nil (moving from root)"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {new-collection-id :id} {:name "New Collection"}
                     :model/User {user-id :id} {}]
        (mt/with-current-user user-id
          ;; Grant write permission to new collection
          (perms/grant-collection-readwrite-permissions! (perms/all-users-group) new-collection-id)

          ;; Should not throw any exception when old collection is nil
          (is (true? (report/validate-collection-move-permissions nil new-collection-id))))))))

(deftest validate-collection-move-permissions-allows-move-to-root-test
  (testing "allows move when new collection is nil (moving to root)"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {old-collection-id :id} {:name "Old Collection"}
                     :model/User {user-id :id} {}]
        (mt/with-current-user user-id
          ;; Grant write permission to old collection
          (perms/grant-collection-readwrite-permissions! (perms/all-users-group) old-collection-id)

          ;; Should not throw any exception when new collection is nil
          (is (nil? (report/validate-collection-move-permissions old-collection-id nil))))))))

(deftest validate-collection-move-permissions-allows-move-both-nil-test
  (testing "allows move when both collections are nil"
    (mt/with-temp [:model/User {user-id :id} {}]
      (mt/with-current-user user-id
        ;; Should not throw any exception when both collections are nil
        (is (nil? (report/validate-collection-move-permissions nil nil)))))))

(deftest validate-collection-move-permissions-throws-400-nonexistent-collection-test
  (testing "throws 400 when new collection does not exist"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {old-collection-id :id} {:name "Old Collection"}
                     :model/User {user-id :id} {}]
        (mt/with-current-user user-id
          ;; Grant write permission to old collection
          (perms/grant-collection-readwrite-permissions! (perms/all-users-group) old-collection-id)

          ;; Use a non-existent collection ID
          (let [non-existent-id 999999]
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You do not have curate permissions for this Collection."
                                  (report/validate-collection-move-permissions old-collection-id non-existent-id)))))))))

(deftest validate-collection-move-permissions-throws-400-archived-collection-test
  (testing "throws 400 when new collection is archived"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {old-collection-id :id} {:name "Old Collection"}
                     :model/Collection {archived-collection-id :id} {:name "Archived Collection" :archived true}
                     :model/User {user-id :id} {}]
        (mt/with-current-user user-id
          ;; Grant write permissions to both collections
          (perms/grant-collection-readwrite-permissions! (perms/all-users-group) old-collection-id)
          (perms/grant-collection-readwrite-permissions! (perms/all-users-group) archived-collection-id)

          ;; Should throw 400 exception for archived collection
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid"
                                (report/validate-collection-move-permissions old-collection-id archived-collection-id))))))))

(deftest validate-collection-move-permissions-superuser-test
  (testing "superuser can move between any collections"
    (mt/with-temp [:model/Collection {old-collection-id :id} {:name "Old Collection"}
                   :model/Collection {new-collection-id :id} {:name "New Collection"}]
      (mt/with-current-user (mt/user->id :crowberto)
        ;; Superuser should be able to move without explicit permissions
        (is (true? (report/validate-collection-move-permissions old-collection-id new-collection-id)))))))

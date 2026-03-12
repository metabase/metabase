(ns metabase.documents.models.dashboard-card-test
  (:require
   [clojure.test :refer :all]
   [metabase.dashboards.models.dashboard-card :as dashboard-card]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest prevent-in-report-cards-from-being-added-to-dashboards-test
  (testing "Cannot add a card with document_id to dashboard"
    (mt/with-temp [:model/Dashboard dashboard   {}
                   :model/Document  document    {}
                   :model/Card      normal-card  {:name "Normal Card" :type :question}
                   :model/Card      report-card  {:name "Report Card" :type :question :document_id (:id document)}]
      (testing "Adding a normal card works fine"
        (let [result (dashboard-card/create-dashboard-cards!
                      [{:dashboard_id (:id dashboard)
                        :card_id      (:id normal-card)
                        :size_x       4
                        :size_y       3
                        :row          0
                        :col          0}])]
          (is (= 1 (count result)))
          (is (= (:id normal-card) (:card_id (first result))))))

      (testing "Adding an in_document card throws an exception"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Cards with 'document_id' cannot be added to dashboards"
             (dashboard-card/create-dashboard-cards!
              [{:dashboard_id (:id dashboard)
                :card_id      (:id report-card)
                :size_x       4
                :size_y       3
                :row          1
                :col          0}]))))))

  (testing "Cannot add multiple cards if any of them has a document_id"
    (mt/with-temp [:model/Dashboard dashboard    {}
                   :model/Document  document    {}
                   :model/Card      normal-card1  {:name "Normal Card 1" :type :question}
                   :model/Card      normal-card2  {:name "Normal Card 2" :type :model}
                   :model/Card      report-card1 {:name "Report Card" :type :question :document_id (:id document)}]
      (testing "Batch creation fails if any card is in_document type"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Cards with 'document_id' cannot be added to dashboards"
             (dashboard-card/create-dashboard-cards!
              [{:dashboard_id (:id dashboard)
                :card_id      (:id normal-card1)
                :size_x       4
                :size_y       3
                :row          0
                :col          0}
               {:dashboard_id (:id dashboard)
                :card_id      (:id report-card1)
                :size_x       4
                :size_y       3
                :row          0
                :col          4}
               {:dashboard_id (:id dashboard)
                :card_id      (:id normal-card2)
                :size_x       4
                :size_y       3
                :row          0
                :col          8}])))

        ;; Verify that no cards were added due to transaction rollback
        (is (= 0 (t2/count :model/DashboardCard :dashboard_id (:id dashboard))))))))

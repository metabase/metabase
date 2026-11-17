(ns ^:synchronized metabase.events.counter-updates-test
  "An update of only a view counter or a last-use timestamp through the model reaches no consumer that records it:
  no audit entry, Revision or change log entry, and no query of the consumers that only bookkeep."
  (:require
   [clojure.test :refer :all]
   [metabase.config.core :as config]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- row-counts
  "The number of rows of the tables the consumers record into."
  []
  {:audit_log  (t2/count :audit_log)
   :revision   (t2/count :revision)
   :change_log (if config/ee-available? (t2/count :change_log) 0)})

(deftest counter-updates-record-nothing-test
  (mt/with-premium-features #{:audit-app :dependencies :change-log :content-diagnostics}
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card      {card-id :id} {}
                     :model/Dashboard {dash-id :id} {}
                     :model/Document  {doc-id :id}  {}]
        (doseq [[model id changes] [[:model/Card card-id {:view_count 5}]
                                    [:model/Card card-id {:last_used_at (java.time.OffsetDateTime/now)}]
                                    [:model/Dashboard dash-id {:view_count 5}]
                                    [:model/Dashboard dash-id {:last_viewed_at (java.time.OffsetDateTime/now)}]
                                    [:model/Document doc-id {:view_count 5}]
                                    [:model/Document doc-id {:last_viewed_at (java.time.OffsetDateTime/now)}]]]
          (testing (str model " " (keys changes))
            (let [before (row-counts)]
              (t2/update! model :id id changes)
              (is (= before (row-counts))))))))))

(deftest counter-updates-query-only-for-the-write-test
  (testing "a counter-only update runs the statements of the write itself and no consumer's query: for a Card the load
            of the row, its UPDATE (counted twice by Toucan), the after-update read and the read of the Actions that move
            with it; for a Dashboard or a Document the load and the UPDATE"
    (mt/with-premium-features #{:audit-app :dependencies :change-log :content-diagnostics}
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Card      {card-id :id} {}
                       :model/Dashboard {dash-id :id} {}
                       :model/Document  {doc-id :id}  {}]
          (search.tu/with-index-disabled
            (doseq [[model id changes expected] [[:model/Card card-id {:view_count 7} 5]
                                                 [:model/Card card-id {:last_used_at (java.time.OffsetDateTime/now)} 5]
                                                 [:model/Dashboard dash-id {:view_count 7} 2]
                                                 [:model/Dashboard dash-id {:last_viewed_at (java.time.OffsetDateTime/now)} 2]
                                                 [:model/Document doc-id {:view_count 7} 2]
                                                 [:model/Document doc-id {:last_viewed_at (java.time.OffsetDateTime/now)} 2]]]
              (testing (str model " " (keys changes))
                (t2/with-call-count [call-count]
                  (t2/update! model :id id changes)
                  (is (= expected (call-count))))))))))))

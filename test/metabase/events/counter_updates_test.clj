(ns ^:synchronized metabase.events.counter-updates-test
  "An update of only a view counter or a last-use timestamp through the model reaches no consumer that records it:
  no audit entry, Revision or change log entry, and no query of the consumers that only bookkeep."
  (:require
   [clojure.test :refer :all]
   [metabase.config.core :as config]
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
                     :model/Dashboard {dash-id :id} {}]
        (doseq [[model id changes] [[:model/Card card-id {:view_count 5}]
                                    [:model/Card card-id {:last_used_at (java.time.OffsetDateTime/now)}]
                                    [:model/Dashboard dash-id {:view_count 5}]
                                    [:model/Dashboard dash-id {:last_viewed_at (java.time.OffsetDateTime/now)}]]]
          (testing (str model " " (keys changes))
            (let [before (row-counts)]
              (t2/update! model :id id changes)
              (is (= before (row-counts))))))))))

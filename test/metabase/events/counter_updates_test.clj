(ns ^:synchronized metabase.events.counter-updates-test
  "An update of only a view counter or a last-use timestamp through the model reaches no consumer that records it:
  no audit entry, Revision or change log entry, and no query of the consumers that only bookkeep."
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.audit-app.events.audit-log]
   [metabase.audit-app.spec :as audit.spec]
   [metabase.config.core :as config]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.revisions.events]
   [metabase.revisions.spec :as revisions.spec]
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

(defn- card-update-statements
  "The number of statements of an UPDATE of a Card row through the model."
  []
  (if (#{:mysql :mariadb} (mdb/db-type)) 7 5))

(deftest counter-updates-query-only-for-write-test
  (testing "a counter-only update runs the statements of the write itself and no consumer's query: for a Card the load
            of the row, its UPDATE (counted twice by Toucan), the after-update read and the read of the Actions that move
            with it, and on MySQL and MariaDB, which return no rows of an UPDATE, one more read of the row and one more
            UPDATE; for a Dashboard or a Document the load and the UPDATE"
    (mt/with-premium-features #{:audit-app :dependencies :change-log :content-diagnostics}
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Card      {card-id :id} {}
                       :model/Dashboard {dash-id :id} {}
                       :model/Document  {doc-id :id}  {}]
          (search.tu/with-index-disabled
            (doseq [[model id changes expected] [[:model/Card card-id {:view_count 7} (card-update-statements)]
                                                 [:model/Card card-id {:last_used_at (java.time.OffsetDateTime/now)} (card-update-statements)]
                                                 [:model/Dashboard dash-id {:view_count 7} 2]
                                                 [:model/Dashboard dash-id {:last_viewed_at (java.time.OffsetDateTime/now)} 2]
                                                 [:model/Document doc-id {:view_count 7} 2]
                                                 [:model/Document doc-id {:last_viewed_at (java.time.OffsetDateTime/now)} 2]]]
              (testing (str model " " (keys changes))
                (t2/with-call-count [call-count]
                  (t2/update! model :id id changes)
                  (is (= expected (call-count))))))))))))

(defn- ignored-columns-of
  "The columns that the audit log ignores for `model` from its list, and the counters and computed columns that the revision spec of `model` skips."
  [model]
  {:audit     (audit.spec/skipped-columns model)
   :revisions (into #{}
                    (filter #{:view_count :last_used_at :last_viewed_at :cache_invalidated_at :collection_position
                              :entity_id :position :last_checkpoint_value :target_table_id :table_dependencies
                              :dimensions :dimension_mappings})
                    (:skip (revisions.spec/spec model)))})

(deftest ignored-columns-record-nothing-test
  (testing "an update of only a column that a consumer ignores is recorded by none of the consumers that ignore it"
    (mt/with-temporary-raw-setting-values [transforms-enabled "true"]
      (mt/with-premium-features #{:audit-app :dependencies :change-log :content-diagnostics :transforms-basic}
        (mt/with-current-user (mt/user->id :crowberto)
          (mt/with-temp [:model/Table     {table-id :id}     {}
                         :model/Card      {card-id :id}      {}
                         :model/Dashboard {dash-id :id}      {}
                         :model/Document  {doc-id :id}       {}
                         :model/Transform {transform-id :id} {:name "Ignored"}
                         :model/Measure   {measure-id :id}   {:table_id (mt/id :venues)
                                                              :definition (let [mp (mt/metadata-provider)] (lib/aggregate (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/count)))}]
            (let [now        (java.time.OffsetDateTime/now)
                  value-for  {:updated_at           now
                              :view_count           5
                              :last_used_at         now
                              :last_viewed_at       now
                              :cache_invalidated_at now
                              :last_query_start     now
                              :collection_position  3
                              :entity_id            "abcdefghijklmnopqrstu"
                              :position             1
                              :last_checkpoint_value "5"
                              :target_table_id      table-id
                              :table_dependencies   []
                              :dimensions           []
                              :dimension_mappings   []}
                  unknown    (atom #{})]
              (doseq [[model id] [[:model/Card card-id] [:model/Dashboard dash-id] [:model/Document doc-id]
                                  [:model/Transform transform-id] [:model/Measure measure-id]]
                      :let [{:keys [audit revisions]} (ignored-columns-of model)
                            row (t2/select-one model :id id)]
                      column (into audit revisions)
                      :when (contains? row column)]
                (if-not (contains? value-for column)
                  (swap! unknown conj [model column])
                  (testing (str model " " column)
                    (let [before (row-counts)]
                      (t2/update! model :id id {column (value-for column)})
                      (let [after (row-counts)]
                        (when (contains? audit column)
                          (is (= (:audit_log before) (:audit_log after))))
                        (when (contains? revisions column)
                          (is (= (:revision before) (:revision after)))))))))
              (testing "every ignored column has a value in this test"
                (is (empty? @unknown))))))))))

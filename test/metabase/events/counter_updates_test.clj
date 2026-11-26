(ns ^:synchronized metabase.events.counter-updates-test
  "An update of only a view counter or a last-use timestamp through the model reaches no consumer that records it:
  no audit entry, Revision or change log entry, and no query of the consumers that only bookkeep."
  (:require
   [clojure.test :refer :all]
   [metabase.audit-app.events.audit-log]
   [metabase.audit-app.spec :as audit.spec]
   [metabase.config.core :as config]
   [metabase.events.test-util :as events.tu]
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
  {:audit_log  (t2/count (t2/table-name :model/AuditLog))
   :revision   (t2/count (t2/table-name :model/Revision))
   :change_log (if config/ee-available? (t2/count :model/ChangeLog) 0)})

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

(deftest counter-updates-query-only-for-write-test
  (testing "a counter-only update runs the statements of the write itself and no consumer's query, for any number of
            rows"
    (mt/with-premium-features #{:audit-app :dependencies :change-log :content-diagnostics}
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Card      {c1 :id} {}
                       :model/Card      {c2 :id} {}
                       :model/Card      {c3 :id} {}
                       :model/Card      {c4 :id} {}
                       :model/Card      {c5 :id} {}
                       :model/Card      {c6 :id} {}
                       :model/Dashboard {d1 :id} {}
                       :model/Dashboard {d2 :id} {}
                       :model/Dashboard {d3 :id} {}
                       :model/Dashboard {d4 :id} {}
                       :model/Dashboard {d5 :id} {}
                       :model/Dashboard {d6 :id} {}
                       :model/Document  {o1 :id} {}
                       :model/Document  {o2 :id} {}
                       :model/Document  {o3 :id} {}
                       :model/Document  {o4 :id} {}
                       :model/Document  {o5 :id} {}
                       :model/Document  {o6 :id} {}]
          (search.tu/with-index-disabled
            (let [now       (java.time.OffsetDateTime/now)
                  value     {:view_count     identity
                             :last_used_at   #(.plusSeconds now %)
                             :last_viewed_at #(.plusSeconds now %)}
                  model-ids {:model/Card      [c1 c2 c3 c4 c5 c6]
                             :model/Dashboard [d1 d2 d3 d4 d5 d6]
                             :model/Document  [o1 o2 o3 o4 o5 o6]}]
              (doseq [[model column] [[:model/Card :view_count]
                                      [:model/Card :last_used_at]
                                      [:model/Dashboard :view_count]
                                      [:model/Dashboard :last_viewed_at]
                                      [:model/Document :view_count]
                                      [:model/Document :last_viewed_at]]]
                (testing (str model " " column)
                  (let [counted (fn [n step]
                                  (t2/with-call-count [call-count]
                                    (t2/update! model :id [:in (take n (model-ids model))] {column ((value column) step)})
                                    (call-count)))]
                    (counted 1 10)
                    (let [small (counted 2 20)]
                      (is (= small (counted 6 30)))
                      (testing "and as many as with no consumer"
                        (is (= small (events.tu/without-delivery (counted 2 40))))))))))))))))

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

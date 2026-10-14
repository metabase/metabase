(ns metabase.sync.analyze.interestingness-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.interestingness.core :as interestingness]
   [metabase.interestingness.dimension :as dim]
   [metabase.sync.analyze.interestingness :as sync.interestingness]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

;;; Smoke tests for the canonical weight profiles. The sync step itself is verified
;;; end-to-end via `automagic_dashboards` integration tests (which fingerprint + score
;;; real tables). Here we just pin down the profile shape and directional behavior.

(deftest ^:parallel canonical-dimension-weights-shape-test
  (is (map? dim/canonical-dimension-weights))
  (is (every? fn? (keys dim/canonical-dimension-weights)))
  (is (every? pos? (vals dim/canonical-dimension-weights))))

(deftest ^:parallel dimension-interestingness-kills-pks-test
  (let [result (interestingness/dimension-interestingness
                {:semantic_type :type/PK
                 :base_type :type/Integer
                 :fingerprint {:global {:distinct-count 1000 :nil% 0.0}}})]
    (is (<= result 0.1))))

(deftest ^:parallel dimension-interestingness-rewards-temporal-test
  (let [result (interestingness/dimension-interestingness
                {:semantic_type :type/CreationTimestamp
                 :base_type :type/DateTime
                 :fingerprint {:global {:distinct-count 5000 :nil% 0.0}
                               :type {:type/DateTime {:earliest "2022-01-01"
                                                      :latest "2024-12-31"}}}})]
    (is (>= result 0.7))))

(deftest score-missing-leftovers-backfills-null-scores-test
  (testing "the leftovers pass scores fields whose dimension_interestingness is still NULL"
    (mt/with-temp [:model/Database database {}
                   :model/Table    table    {:db_id (:id database)}
                   :model/Field    field    {:table_id (:id table)}]
      (is (nil? (t2/select-one-fn :dimension_interestingness :model/Field :id (:id field))))
      (is (= {:fields-scored 1 :fields-failed 0}
             (#'sync.interestingness/score-missing-leftovers! database)))
      (is (some? (t2/select-one-fn :dimension_interestingness :model/Field :id (:id field))))
      (testing "once scored, the field is no longer selected"
        (is (= {:fields-scored 0 :fields-failed 0}
               (#'sync.interestingness/score-missing-leftovers! database)))))))

(deftest score-missing-leftovers-does-not-retry-failed-fields-test
  (testing "a field whose scoring attempt failed is not re-attempted by later leftovers passes in this process"
    (mt/with-temp [:model/Database database {}
                   :model/Table    table    {:db_id (:id database)}
                   :model/Field    _field   {:table_id (:id table)}]
      (let [calls (atom 0)]
        (mt/with-dynamic-fn-redefs [interestingness/dimension-interestingness (fn [_field]
                                                                                (swap! calls inc)
                                                                                (throw (ex-info "boom" {})))]
          (is (= {:fields-scored 0 :fields-failed 1}
                 (#'sync.interestingness/score-missing-leftovers! database)))
          (is (= 1 @calls))
          (is (= {:fields-scored 0 :fields-failed 0}
                 (#'sync.interestingness/score-missing-leftovers! database)))
          (is (= 1 @calls) "the failed field should be skipped, not re-scored on every sync"))))))

;;; ------------------------------------------- leftovers pass: paging and limits -------------------------------------

(defn- score-of [field]
  (t2/select-one-fn :dimension_interestingness :model/Field :id (u/the-id field)))

(defn- with-group-size! [n thunk]
  (with-redefs-fn {#'sync.interestingness/leftovers-group-size n} thunk))

(deftest score-missing-leftovers-pages-across-groups-test
  (testing "every unscored field is scored even when they outnumber what one group holds"
    (mt/with-temp [:model/Database database {}
                   :model/Table    table    {:db_id (:id database)}
                   :model/Field    f1       {:table_id (:id table)}
                   :model/Field    f2       {:table_id (:id table)}
                   :model/Field    f3       {:table_id (:id table)}
                   :model/Field    f4       {:table_id (:id table)}
                   :model/Field    f5       {:table_id (:id table)}]
      (with-group-size! 2
        (fn []
          (is (= {:fields-scored 5 :fields-failed 0}
                 (#'sync.interestingness/score-missing-leftovers! database))
              "a group size smaller than the field count must not stop the pass early")))
      (is (every? some? (map score-of [f1 f2 f3 f4 f5]))))))

(deftest score-missing-leftovers-stops-at-the-per-sync-limit-test
  (testing "one run scores at most the configured number of fields, and says how many are left"
    (mt/with-temp [:model/Database database {}
                   :model/Table    table    {:db_id (:id database)}
                   :model/Field    _f1      {:table_id (:id table)}
                   :model/Field    _f2      {:table_id (:id table)}
                   :model/Field    _f3      {:table_id (:id table)}
                   :model/Field    _f4      {:table_id (:id table)}
                   :model/Field    _f5      {:table_id (:id table)}]
      (mt/with-temporary-setting-values [interestingness-max-fields-per-sync 2]
        (let [stats (#'sync.interestingness/score-missing-leftovers! database)]
          (is (= 2 (:fields-scored stats)))
          (is (= 0 (:fields-failed stats)))
          (is (= 3 (:fields-remaining stats))
              "a truncated run reports how many fields of this database are still unscored")))
      (testing "the scores written before the limit hit are committed, not rolled back"
        (is (= 3 (t2/count :model/Field :table_id (:id table) :dimension_interestingness nil))))
      (testing "the next run continues on the remainder rather than starting over"
        (mt/with-temporary-setting-values [interestingness-max-fields-per-sync 100]
          (is (= {:fields-scored 3 :fields-failed 0}
                 (#'sync.interestingness/score-missing-leftovers! database)))))
      (testing "and a run with nothing left to do reports no remainder"
        (is (= {:fields-scored 0 :fields-failed 0}
               (#'sync.interestingness/score-missing-leftovers! database)))))))

(deftest score-missing-leftovers-keeps-going-past-a-failing-field-test
  (testing "a field whose scoring throws does not stop the rest of the run"
    (mt/with-temp [:model/Database database {}
                   :model/Table    table    {:db_id (:id database)}
                   :model/Field    f1       {:table_id (:id table) :name "aaa"}
                   :model/Field    f2       {:table_id (:id table) :name "boom"}
                   :model/Field    f3       {:table_id (:id table) :name "zzz"}]
      (mt/with-dynamic-fn-redefs [interestingness/dimension-interestingness
                                  (fn [field]
                                    (if (= "boom" (:name field))
                                      (throw (ex-info "boom" {}))
                                      0.5))]
        (with-group-size! 1
          (fn []
            (is (= {:fields-scored 2 :fields-failed 1}
                   (#'sync.interestingness/score-missing-leftovers! database))
                "the failing field must not halt the pass, nor stall the cursor on itself"))))
      (is (= [0.5 nil 0.5] (map score-of [f1 f2 f3]))))))

(deftest score-missing-leftovers-persists-the-canonical-score-test
  (testing "the pass persists exactly what the scorer computes for the field"
    (let [fingerprint {:global {:distinct-count 5000 :nil% 0.0}
                       :type   {:type/DateTime {:earliest "2022-01-01" :latest "2024-12-31"}}}]
      (mt/with-temp [:model/Database database {}
                     :model/Table    table    {:db_id (:id database)}
                     :model/Field    field    {:table_id      (:id table)
                                               :base_type     :type/DateTime
                                               :semantic_type :type/CreationTimestamp
                                               :fingerprint   fingerprint}]
        (is (= {:fields-scored 1 :fields-failed 0}
               (#'sync.interestingness/score-missing-leftovers! database)))
        (is (= (interestingness/dimension-interestingness
                (t2/select-one :model/Field :id (:id field)))
               (score-of field)))))))

(deftest score-missing-leftovers-respects-user-set-visibility-test
  (testing "a Field hidden by a user is not scored, as users' visibility_type is what the pass selects on"
    (mt/with-temp [:model/Database database {}
                   :model/Table    table    {:db_id (:id database)}
                   :model/Field    visible  {:table_id (:id table)}
                   :model/Field    hidden   {:table_id (:id table)}]
      (t2/insert! :model/FieldUserSettings {:field_id        (:id hidden)
                                            :visibility_type :sensitive})
      (is (= {:fields-scored 1 :fields-failed 0}
             (#'sync.interestingness/score-missing-leftovers! database)))
      (is (some? (score-of visible)))
      (is (nil? (score-of hidden))
          "the user-set visibility_type must still exclude the field after the rewrite"))))

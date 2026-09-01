(ns metabase.sync.analyze.data-sensitivity-test
  (:require
   [clojure.test :refer :all]
   [metabase.analyze.core :as analyze]
   [metabase.sync.analyze.data-sensitivity :as sync.data-sensitivity]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.warehouse-schema.models.field-user-settings :as field-user-settings]
   [toucan2.core :as t2]))

(defn- label [field-or-id]
  (t2/select-one-fn :data_sensitivity :model/Field :id (u/the-id field-or-id)))

(defn- mirror-label [field-or-id]
  (t2/select-one-fn :data_sensitivity :model/FieldUserSettings :field_id (u/the-id field-or-id)))

(defn- selected-names [table force?]
  (set (map :name (#'sync.data-sensitivity/fields-to-scan table force?))))

(deftest ^:parallel fields-to-scan-test
  (mt/with-temp [:model/Database db    {}
                 :model/Table    table {:db_id (:id db) :name "app_users"}
                 :model/Field    _     {:table_id (:id table) :name "unscanned"  :base_type :type/Text}
                 :model/Field    _     {:table_id (:id table) :name "public"     :base_type :type/Text :data_sensitivity :PUBLIC}
                 :model/Field    _     {:table_id (:id table) :name "labeled"    :base_type :type/Text :data_sensitivity :PII}
                 :model/Field    _     {:table_id (:id table) :name "retired"    :base_type :type/Text :visibility_type :retired}
                 :model/Field    _     {:table_id (:id table) :name "sensitive"  :base_type :type/Text :visibility_type :sensitive}
                 :model/Field    _     {:table_id (:id table) :name "hidden"     :base_type :type/Text :visibility_type :hidden}
                 :model/Field    _     {:table_id (:id table) :name "details"    :base_type :type/Text :visibility_type :details-only}
                 :model/Field    _     {:table_id (:id table) :name "inactive"   :base_type :type/Text :active false}]
    (testing "a scheduled scan selects NULL fields of any visibility except retired, never inactive or labeled ones"
      (is (= #{"unscanned" "sensitive" "hidden" "details"}
             (selected-names table false))))
    (testing "a forced scan also reselects PUBLIC fields but never categorized ones"
      (is (= #{"unscanned" "sensitive" "hidden" "details" "public"}
             (selected-names table true))))))

(deftest ^:parallel table-ids-with-unscanned-fields-test
  (mt/with-temp [:model/Database db       {}
                 :model/Database other-db {}
                 :model/Table    hidden   {:db_id (:id db) :name "hidden_t" :visibility_type :hidden}
                 :model/Table    cruft    {:db_id (:id db) :name "cruft_t" :visibility_type :cruft}
                 :model/Table    done     {:db_id (:id db) :name "done_t"}
                 :model/Table    inactive {:db_id (:id db) :name "inactive_t" :active false}
                 :model/Table    foreign  {:db_id (:id other-db) :name "foreign_t"}
                 :model/Field    _        {:table_id (:id hidden)   :name "a" :base_type :type/Text}
                 :model/Field    _        {:table_id (:id cruft)    :name "b" :base_type :type/Text}
                 :model/Field    _        {:table_id (:id done)     :name "c" :base_type :type/Text :data_sensitivity :PUBLIC}
                 :model/Field    _        {:table_id (:id done)     :name "d" :base_type :type/Text :data_sensitivity :PII}
                 :model/Field    _        {:table_id (:id inactive) :name "e" :base_type :type/Text}
                 :model/Field    _        {:table_id (:id foreign)  :name "f" :base_type :type/Text}]
    (testing "hidden and cruft tables with unscanned fields are selected; converged, inactive, and foreign tables are not"
      (is (= #{(:id hidden) (:id cruft)}
             (#'sync.data-sensitivity/table-ids-with-unscanned-fields db false))))
    (testing "force reselects the table whose only unlabeled field is PUBLIC"
      (is (= #{(:id hidden) (:id cruft) (:id done)}
             (#'sync.data-sensitivity/table-ids-with-unscanned-fields db true))))))

(deftest scan-fields-for-db-converges-test
  (mt/with-temporary-setting-values [data-sensitivity-scan-enabled true]
    (mt/with-temp [:model/Database db    {}
                   :model/Table    table {:db_id (:id db) :name "app_users" :entity_type :entity/UserTable}
                   :model/Field    ssn   {:table_id (:id table) :name "ssn" :base_type :type/Text}
                   :model/Field    foo   {:table_id (:id table) :name "foo" :base_type :type/Text}]
      (testing "the first scan labels every unscanned field, PUBLIC when nothing matches, without creating mirror rows"
        (is (= {:fields-scanned 2 :fields-labeled 1 :fields-failed 0}
               (sync.data-sensitivity/scan-fields-for-db! db nil)))
        (is (= :PII (label ssn)))
        (is (= :PUBLIC (label foo)))
        (is (nil? (mirror-label ssn)))
        (is (nil? (mirror-label foo))))
      (testing "a second scan selects nothing"
        (is (= {:fields-scanned 0 :fields-labeled 0 :fields-failed 0}
               (sync.data-sensitivity/scan-fields-for-db! db nil)))))))

(deftest setting-gates-scans-test
  (mt/with-temporary-setting-values [data-sensitivity-scan-enabled false]
    (mt/with-temp [:model/Database db    {}
                   :model/Table    table {:db_id (:id db) :name "app_users"}
                   :model/Field    ssn   {:table_id (:id table) :name "ssn" :base_type :type/Text}]
      (testing "with the setting off both entry points return zero stats and write nothing"
        (is (= {:fields-scanned 0 :fields-labeled 0 :fields-failed 0}
               (sync.data-sensitivity/scan-fields-for-db! db nil)))
        (is (= {:fields-scanned 0 :fields-labeled 0 :fields-failed 0}
               (sync.data-sensitivity/scan-table! table)))
        (is (nil? (label ssn))))
      (testing "the REPL entry point ignores the setting"
        (is (= {:fields-scanned 1 :fields-labeled 1 :fields-failed 0}
               (sync.data-sensitivity/scan-data-sensitivity! db)))
        (is (= :PII (label ssn)))))))

(deftest force-rescans-public-only-test
  (mt/with-temporary-setting-values [data-sensitivity-scan-enabled true]
    (mt/with-temp [:model/Database db    {}
                   :model/Table    table {:db_id (:id db) :name "app_users"}
                   :model/Field    ssn   {:table_id (:id table) :name "ssn" :base_type :type/Text}
                   :model/Field    foo   {:table_id (:id table) :name "foo" :base_type :type/Text}]
      (sync.data-sensitivity/scan-fields-for-db! db nil)
      (is (= :PUBLIC (label foo)))
      (with-redefs [analyze/infer-data-sensitivity (constantly :PHI)]
        (testing "a scheduled scan does not revisit PUBLIC fields even when the rules would now match"
          (is (= {:fields-scanned 0 :fields-labeled 0 :fields-failed 0}
                 (sync.data-sensitivity/scan-fields-for-db! db nil)))
          (is (= :PUBLIC (label foo))))
        (testing "a forced scan revisits PUBLIC fields and leaves categorized fields alone"
          (is (= {:fields-scanned 1 :fields-labeled 1 :fields-failed 0}
                 (sync.data-sensitivity/scan-data-sensitivity! db :force? true)))
          (is (= :PHI (label foo)))
          (is (= :PII (label ssn))))))))

(deftest user-label-in-mirror-wins-test
  (testing "a mirror-only user label is what the field reads after the classifier writes"
    (mt/with-temp [:model/Database db     {}
                   :model/Table    table  {:db_id (:id db) :name "app_users"}
                   :model/Field    ssn    {:table_id (:id table) :name "ssn" :base_type :type/Text}
                   :model/Field    notes  {:table_id (:id table) :name "notes" :base_type :type/Text}]
      (field-user-settings/upsert-user-settings ssn {:data_sensitivity :PUBLIC})
      (field-user-settings/upsert-user-settings notes {:data_sensitivity :PHI})
      (is (nil? (label ssn)))
      (is (nil? (label notes)))
      (testing "stats count the rule result, the overlay decides what is stored"
        (is (= {:fields-scanned 2 :fields-labeled 1 :fields-failed 0}
               (sync.data-sensitivity/scan-data-sensitivity! db))))
      (is (= :PUBLIC (label ssn)))
      (is (= :PUBLIC (mirror-label ssn)))
      (is (= :PHI (label notes)))
      (is (= :PHI (mirror-label notes)))
      (testing "a forced rescan still cannot override the user's PUBLIC"
        (sync.data-sensitivity/scan-data-sensitivity! db :force? true)
        (is (= :PUBLIC (label ssn)))))))

(deftest classification-failure-is-counted-and-retried-test
  (mt/with-temp [:model/Database db    {}
                 :model/Table    table {:db_id (:id db) :name "app_users"}
                 :model/Field    ssn   {:table_id (:id table) :name "ssn" :base_type :type/Text}]
    (let [calls (atom 0)]
      (with-redefs [analyze/infer-data-sensitivity (fn [& _] (swap! calls inc) (throw (ex-info "boom" {})))]
        (testing "a throwing rule counts as scanned and failed and leaves the field unscanned"
          (is (= {:fields-scanned 1 :fields-labeled 0 :fields-failed 1}
                 (sync.data-sensitivity/scan-data-sensitivity! db)))
          (is (nil? (label ssn))))
        (testing "the next scan retries the field"
          (sync.data-sensitivity/scan-data-sensitivity! db)
          (is (= 2 @calls)))))))

(deftest scan-single-table-test
  (mt/with-temp [:model/Database db     {}
                 :model/Table    users  {:db_id (:id db) :name "app_users"}
                 :model/Table    other  {:db_id (:id db) :name "other"}
                 :model/Field    ssn    {:table_id (:id users) :name "ssn" :base_type :type/Text}
                 :model/Field    email  {:table_id (:id other) :name "email" :base_type :type/Text}]
    (testing "scanning a Table instance labels only that table's fields"
      (is (= {:fields-scanned 1 :fields-labeled 1 :fields-failed 0}
             (sync.data-sensitivity/scan-data-sensitivity! users)))
      (is (= :PII (label ssn)))
      (is (nil? (label email))))))

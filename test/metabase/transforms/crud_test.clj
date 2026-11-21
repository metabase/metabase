(ns metabase.transforms.crud-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver.util :as driver.u]
   [metabase.lib.core :as lib]
   [metabase.test :as mt]
   [metabase.transforms.crud :as transforms.crud]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- lookback-transform [field-id lookback]
  {:name   "Lookback transform"
   :target {:type "table" :name "lookback_target"}
   :source {:type :query
            :query (lib/native-query (mt/metadata-provider) "SELECT 1")
            :source-incremental-strategy {:type "checkpoint"
                                          :checkpoint-filter-field-id field-id
                                          :lookback lookback}}})

(defn- validates?! [transform]
  (transforms.crud/validate-lookback! transform)
  true)

(deftest validate-lookback!-test
  (mt/with-temp [:model/Table {table-id :id}   {}
                 :model/Field {dt-field :id}   {:table_id table-id :base_type :type/DateTime}
                 :model/Field {ts-field :id}   {:table_id table-id :base_type :type/DateTimeWithTZ}
                 :model/Field {date-field :id} {:table_id table-id :base_type :type/Date}
                 :model/Field {time-field :id} {:table_id table-id :base_type :type/Time}
                 :model/Field {num-field :id}  {:table_id table-id :base_type :type/BigInteger}
                 :model/Field {unix-field :id} {:table_id table-id
                                                :base_type :type/BigInteger
                                                :effective_type :type/Instant
                                                :coercion_strategy :Coercion/UNIXSeconds->DateTime}]
    (testing "datetime and timestamp checkpoint columns accept any unit"
      (is (validates?! (lookback-transform dt-field {:value 4 :unit "hour"})))
      (is (validates?! (lookback-transform ts-field {:value 4 :unit "minute"}))))
    (testing "coerced unix-timestamp columns count as temporal via their effective type"
      (is (validates?! (lookback-transform unix-field {:value 4 :unit "day"}))))
    (testing "date-only checkpoint columns require day-or-coarser units"
      (is (validates?! (lookback-transform date-field {:value 4 :unit "day"})))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"days or a coarser unit"
           (validates?! (lookback-transform date-field {:value 4 :unit "hour"})))))
    (testing "time-only checkpoint columns are rejected"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"only supported for date or datetime"
           (validates?! (lookback-transform time-field {:value 1 :unit "day"})))))
    (testing "numeric checkpoint columns are rejected"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"only supported for date or datetime"
           (validates?! (lookback-transform num-field {:value 4 :unit "day"})))))
    (testing "no configured lookback is a no-op"
      (is (validates?! (lookback-transform dt-field nil))))))

(deftest update-transform-publishes-audit-event-test
  (mt/with-temporary-raw-setting-values [transforms-enabled "true"]
    (mt/with-premium-features #{:transforms-basic :audit-app}
      (mt/with-temp [:model/Transform {id :id} {:name   "Original"
                                                :target {:type "table" :schema "PUBLIC" :name "audited_target" :database (mt/id)}}]
        (mt/with-dynamic-fn-redefs [driver.u/supports? (fn [& _] true)]
          (mt/with-current-user (mt/user->id :crowberto)
            (transforms.crud/update-transform! id {:name "Renamed"})))
        (is (= "Renamed" (t2/select-one-fn :name :model/Transform :id id)))
        (is (=? {:topic   :update-transform
                 :user_id (mt/user->id :crowberto)
                 :details {:previous {:name "Original"} :new {:name "Renamed"}}}
                (mt/latest-audit-log-entry :update-transform id)))))))

(deftest check-references-test
  (let [definition {:name   "Referencing transform"
                    :source {:type :query :query (lib/native-query (mt/metadata-provider) "SELECT 1")}
                    :target {:type "table" :name "referenced_target" :database (mt/id)}}]
    (testing "a target database without the features the transform needs"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"does not support the requested transform features"
                            (transforms.crud/check-references definition #{}))))
    (testing "a target database that supports them, schemas included"
      (mt/with-dynamic-fn-redefs [driver.u/supports? (fn [_driver feature & _] (not= feature :schemas))]
        (is (nil? (transforms.crud/check-references definition #{:source :target})))))
    (testing "a target schema the driver needs"
      (mt/with-dynamic-fn-redefs [driver.u/supports? (fn [& _] true)]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"target schema is required"
                              (transforms.crud/check-references definition #{:target})))
        (is (nil? (transforms.crud/check-references definition #{:source})))))))

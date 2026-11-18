(ns metabase.analyze.classifiers.table-role-test
  (:require
   [clojure.test :refer :all]
   [metabase.analyze.classifiers.table-role :as classifiers.table-role]
   [metabase.models.interface :as mi]
   [metabase.types.core :as types]))

(defn- field [field-name base-type & {:as more}]
  (merge {:name field-name, :base_type base-type} more))

(defn- pk [field-name base-type]
  (field field-name base-type :semantic_type :type/PK :database_is_pk true))

(defn- fk [field-name & {:as more}]
  (merge (field field-name :type/Integer :semantic_type :type/FK) more))

(defn- infer [table-name fields]
  (classifiers.table-role/infer-table-role table-name fields))

(defn- role [table-name fields]
  (:role (infer table-name fields)))

(deftest ^:parallel bridge-test
  (testing "every column a key and two foreign keys: a bridge"
    (is (=? {:role       :role/Bridge
             :signal     "every column is a key, linking 2 tables"
             :confidence :high}
            (infer "film_actor" [(fk "actor_id" :database_is_pk true)
                                 (fk "film_id" :database_is_pk true)]))))
  (testing "a non-key attribute means it is not a pure bridge"
    (is (not= :role/Bridge
              (role "film_actor" [(fk "actor_id") (fk "film_id") (field "character" :type/Text)])))))

(deftest ^:parallel array-child-test
  (testing "a parent key plus a position: one element of the parent's list"
    (is (=? {:role       :role/ArrayChild
             :signal     "its key is order_id plus the position index"
             :confidence :high}
            (infer "order_line" [(fk "order_id" :database_is_pk true)
                                 (pk "index" :type/Integer)
                                 (field "sku" :type/Text)]))))
  (testing "a position without exactly one parent is not an array child"
    (is (not= :role/ArrayChild
              (role "x" [(pk "position" :type/Integer) (field "sku" :type/Text)])))))

(deftest ^:parallel periodic-snapshot-from-keys-test
  (is (=? {:role       :role/PeriodicSnapshotFact
           :signal     "its key is the date day plus foreign keys"
           :confidence :high}
          (infer "inventory" [(pk "day" :type/Date)
                              (fk "product_id" :database_is_pk true)
                              (field "on_hand" :type/Integer)]))))

(deftest ^:parallel history-from-keys-test
  (is (=? {:role :role/HistoryDimension, :confidence :high}
          (infer "customer" [(pk "id" :type/Integer)
                             (pk "version" :type/Integer)
                             (field "name" :type/Text)]))))

(deftest ^:parallel history-from-validity-columns-test
  (testing "valid-from and valid-to columns: SCD2 history"
    (is (=? {:role       :role/HistoryDimension
             :signal     "it has valid_from and valid_to columns"
             :confidence :high}
            (infer "customer" [(pk "id" :type/Integer)
                               (field "name" :type/Text)
                               (field "valid_from" :type/DateTime)
                               (field "valid_to" :type/DateTime)]))))
  (testing "Fivetran history mode"
    (is (= :role/HistoryDimension
           (role "customer" [(pk "id" :type/Integer)
                             (field "_fivetran_start" :type/DateTime)
                             (field "_fivetran_end" :type/DateTime)]))))
  (testing "columns typed as validity bounds count whatever their names"
    (is (= :role/HistoryDimension
           (role "customer" [(pk "id" :type/Integer)
                             (field "began" :type/DateTime :semantic_type :type/ValidFrom)
                             (field "stopped" :type/DateTime :semantic_type :type/ValidTo)])))))

(deftest ^:parallel accumulating-snapshot-test
  (is (=? {:role       :role/AccumulatingSnapshotFact
           :signal     "it has 2 milestone dates and status"
           :confidence :low}
          (infer "shipments" [(pk "id" :type/Integer)
                              (field "status" :type/Text)
                              (field "shipped_at" :type/DateTime)
                              (field "delivered_at" :type/DateTime)])))
  (testing "a `state` column only counts as a status when it holds text"
    (is (not= :role/AccumulatingSnapshotFact
              (role "shipments" [(pk "id" :type/Integer)
                                 (field "state" :type/Integer)
                                 (field "shipped_at" :type/DateTime)
                                 (field "delivered_at" :type/DateTime)])))))

(deftest ^:parallel lookup-test
  (is (=? {:role :role/LookupDimension, :confidence :low}
          (infer "x" [(pk "id" :type/Integer)
                      (field "code" :type/Text)
                      (field "label" :type/Text)]))))

(deftest ^:parallel event-fact-from-columns-test
  (is (=? {:role       :role/EventFact
           :signal     "it has one timestamp, no updated_at, and a link to user_id"
           :confidence :low}
          (infer "x" [(pk "id" :type/Integer)
                      (fk "user_id")
                      (field "occurred_at" :type/DateTime)
                      (field "kind" :type/Text)
                      (field "payload" :type/Text)
                      (field "source" :type/Text)])))
  (testing "an updated_at means the rows change, so not an event stream"
    (is (not= :role/EventFact
              (role "x" [(pk "id" :type/Integer)
                         (fk "user_id")
                         (field "updated_at" :type/DateTime)
                         (field "kind" :type/Text)
                         (field "payload" :type/Text)
                         (field "source" :type/Text)])))))

(deftest ^:parallel entity-dimension-from-columns-test
  (is (=? {:role :role/EntityDimension, :confidence :low}
          (infer "x" [(pk "id" :type/Integer)
                      (field "name" :type/Text)
                      (field "created_at" :type/DateTime)
                      (field "updated_at" :type/DateTime)
                      (field "plan" :type/Text)
                      (field "seats" :type/Integer)]))))

(deftest ^:parallel custom-property-test
  (is (=? {:role       :role/CustomPropertyTable
           :signal     "it has contact_id, property_name and value columns"
           :confidence :high}
          (infer "contact_properties" [(fk "contact_id")
                                       (field "property_name" :type/Text)
                                       (field "value" :type/Text)]))))

(deftest ^:parallel configuration-test
  (is (=? {:role :role/ConfigurationTable, :confidence :low}
          (infer "x" [(pk "id" :type/Integer)
                      (field "label" :type/Text)
                      (field "field_type" :type/Text)
                      (field "required" :type/Boolean)
                      (field "group" :type/Text)
                      (field "hint" :type/Text)]))))

(deftest ^:parallel name-signals-test
  (let [attributes [(pk "id" :type/Integer) (field "a" :type/Text) (field "b" :type/Text)
                    (field "c" :type/Text) (field "d" :type/Text) (field "e" :type/Text)]]
    (are [table-name expected-role expected-confidence]
         (=? {:role expected-role, :confidence expected-confidence} (infer table-name attributes))
      "_fivetran_audit"         :role/SystemTable          :high
      "dim_customer"            :role/EntityDimension      :high
      "fct_orders"              :role/TransactionFact      :high
      "agg_revenue"             :role/AggregateFact        :high
      "hub_customer"            :role/Hub                  :high
      "sat_customer"            :role/Satellite            :high
      "lnk_order_customer"      :role/Link                 :high
      "account_history"         :role/HistoryDimension     :low
      "inventory_snapshot"      :role/HistoryDimension     :low
      "revenue_summary"         :role/AggregateFact        :low
      "ads_daily"               :role/PeriodicSnapshotFact :low
      "product_translations"    :role/TranslationTable     :low
      "ticket_custom_fields"    :role/CustomPropertyTable  :low
      "notification_settings"   :role/ConfigurationTable   :low
      "page_events"             :role/EventFact            :low
      "checkins"                :role/EventFact            :low
      "orders"                  :role/TransactionFact      :low
      "payments"                :role/TransactionFact      :low
      "customers"               :role/EntityDimension      :low
      "ticket_statuses"         :role/LookupDimension      :low)
    (is (= "its name orders matches the naming pattern of a TransactionFact table"
           (:signal (infer "ORDERS" attributes))))))

(deftest ^:parallel keys-beat-columns-beat-names-test
  (testing "a bridge named like a history table is still a bridge"
    (is (= :role/Bridge
           (role "membership_history" [(fk "user_id" :database_is_pk true)
                                       (fk "group_id" :database_is_pk true)]))))
  (testing "validity columns win over an event-like name"
    (is (= :role/HistoryDimension
           (role "events" [(pk "id" :type/Integer)
                           (field "valid_from" :type/DateTime)
                           (field "valid_to" :type/DateTime)])))))

(deftest ^:parallel no-signal-test
  (testing "nothing in the keys, columns or name matches a role"
    (is (nil? (infer "widgets" [(pk "id" :type/Integer)
                                (field "a" :type/Text) (field "b" :type/Text) (field "c" :type/Text)
                                (field "d" :type/Text) (field "e" :type/Text)])))
    (is (nil? (infer "widgets" [])))))

(deftest ^:parallel field-instances-test
  (testing "synced Field instances are accepted as well as plain maps"
    (is (= :role/Bridge
           (role "film_actor" [(mi/instance :model/Field {:name "actor_id", :base_type :type/Integer
                                                          :semantic_type :type/FK, :fk_target_field_id 1})
                               (mi/instance :model/Field {:name "film_id", :base_type :type/Integer
                                                          :semantic_type :type/FK, :fk_target_field_id 2})])))))

(deftest ^:parallel every-role-is-in-the-role-hierarchy-test
  (doseq [[_pattern role _confidence] @#'classifiers.table-role/name-rules]
    (is (isa? types/table-role-hierarchy role :role/*) (pr-str role)))
  (doseq [role [:role/Bridge :role/ArrayChild :role/PeriodicSnapshotFact :role/HistoryDimension
                :role/CustomPropertyTable :role/ConfigurationTable :role/AccumulatingSnapshotFact
                :role/LookupDimension :role/EventFact :role/EntityDimension]]
    (is (isa? types/table-role-hierarchy role :role/*) (pr-str role))))

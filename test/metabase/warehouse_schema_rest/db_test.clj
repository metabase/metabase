(ns metabase.warehouse-schema-rest.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.warehouse-schema-rest.db :as warehouse-schema-rest.db]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(def ^:private injection "x' OR '1'='1")

(defn- names
  [db-id filters]
  (into #{}
        (comp (filter #(= db-id (:db_id %))) (map :name))
        (warehouse-schema-rest.db/matching-tables filters)))

(deftest matching-tables-binds-request-values-test
  (mt/with-temp [:model/Database {db-id :id} {}
                 :model/User     {user-id :id} {}
                 :model/Table    _ {:db_id db-id :name "gadget_orders" :display_name "Gadget Orders"
                                    :data_layer :final :data_source :ingested}
                 :model/Table    _ {:db_id db-id :name "widget_items" :display_name "Widget Items"
                                    :owner_user_id user-id :visibility_type "hidden"}
                 :model/Table    _ {:db_id db-id :name "owned_by_email" :display_name "Owned By Email"
                                    :owner_email "owner@example.com"}
                 :model/Table    _ {:db_id db-id :name "100%_literal" :display_name "100%_literal"}]
    (let [names #(names db-id %)]
      (testing "SQL-looking strings match only as data"
        (is (= #{} (names {:term injection})))
        (is (= #{} (names {:visibility-type injection})))
        (is (= #{} (names {:data-layer injection})))
        (is (= #{} (names {:data-source injection})))
        (is (= #{} (names {:owner-email injection}))))
      (testing "real filters still match"
        (is (= #{"gadget_orders"} (names {:term "gadget*"})))
        (is (= #{"widget_items"} (names {:term "ITEMS"})))
        (is (= #{"widget_items"} (names {:term "ite"}))
            "matches the start of a word in the display name")
        (is (= #{"100%_literal"} (names {:term "100%_"}))
            "LIKE wildcards in the term are matched literally")
        (is (= #{"widget_items"} (names {:visibility-type "hidden"})))
        (is (= #{"gadget_orders"} (names {:data-layer :final})))
        (is (= #{"gadget_orders"} (names {:data-layer "final"})))
        (is (= #{"gadget_orders"} (names {:data-source "ingested"})))
        (is (= #{"widget_items"} (names {:owner-user-id user-id})))
        (is (= #{"owned_by_email"} (names {:owner-email "owner@example.com"})))
        (is (= #{"gadget_orders"} (names {:term "gadget*" :check-unused? true})))))))

(ns metabase.driver.sql-jdbc.sync.describe-table-test
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [clojure.test :refer :all]
            [metabase.driver :as driver]
            [metabase.driver.sql-jdbc.sync.describe-table :as sql-jdbc.describe-table]
            [metabase.driver.sql-jdbc.sync.interface :as sql-jdbc.sync.interface]
            [metabase.models.table :refer [Table]]
            [metabase.test :as mt]))

(defn- sql-jdbc-drivers-with-default-describe-table-impl
  "All SQL JDBC drivers that use the default SQL JDBC implementation of `describe-table`. (As far as I know, this is
  all of them.)"
  []
  (set
   (filter
    #(identical? (get-method driver/describe-table :sql-jdbc) (get-method driver/describe-table %))
    (descendants driver/hierarchy :sql-jdbc))))

(deftest describe-table-test
  (is (= {:name "VENUES",
          :fields
          #{{:name "ID", :database-type "BIGINT", :base-type :type/BigInteger, :database-position 0, :pk? true}
            {:name "NAME", :database-type "VARCHAR", :base-type :type/Text, :database-position 1}
            {:name "CATEGORY_ID", :database-type "INTEGER", :base-type :type/Integer, :database-position 2}
            {:name "LATITUDE", :database-type "DOUBLE", :base-type :type/Float, :database-position 3}
            {:name "LONGITUDE", :database-type "DOUBLE", :base-type :type/Float, :database-position 4}
            {:name "PRICE", :database-type "INTEGER", :base-type :type/Integer, :database-position 5}}}
         (sql-jdbc.describe-table/describe-table :h2 (mt/id) {:name "VENUES"}))))

(deftest describe-table-fks-test
  (is (= #{{:fk-column-name   "CATEGORY_ID"
            :dest-table       {:name "CATEGORIES", :schema "PUBLIC"}
            :dest-column-name "ID"}}
         (sql-jdbc.describe-table/describe-table-fks :h2 (mt/id) {:name "VENUES"})))
  (is (= #{{:fk-column-name "USER_ID", :dest-table {:name "USERS", :schema "PUBLIC"}, :dest-column-name "ID"}
           {:fk-column-name "VENUE_ID", :dest-table {:name "VENUES", :schema "PUBLIC"}, :dest-column-name "ID"}}
         (sql-jdbc.describe-table/describe-table-fks :h2 (mt/id) {:name "CHECKINS"}))))

(deftest database-types-fallback-test
  (mt/test-drivers (sql-jdbc-drivers-with-default-describe-table-impl)
    (let [org-result-set-seq jdbc/result-set-seq]
      (with-redefs [jdbc/result-set-seq (fn [& args]
                                          (map #(dissoc % :type_name) (apply org-result-set-seq args)))]
        (is (= #{{:name "longitude"   :base-type :type/Float}
                 {:name "category_id" :base-type :type/Integer}
                 {:name "price"       :base-type :type/Integer}
                 {:name "latitude"    :base-type :type/Float}
                 {:name "name"        :base-type :type/Text}
                 {:name "id"          :base-type :type/Integer}}
               (->> (sql-jdbc.describe-table/describe-table driver/*driver* (mt/id) (Table (mt/id :venues)))
                    :fields
                    (map (fn [{:keys [name base-type]}]
                           {:name      (str/lower-case name)
                            :base-type (if (or (isa? base-type :type/Integer)
                                               (isa? base-type :type/Decimal)) ; H2 DBs returns the ID as BigInt, Oracle as Decimal;
                                         :type/Integer
                                         base-type)}))
                    set)))))))

(deftest calculated-semantic-type-test
  (mt/test-drivers (sql-jdbc-drivers-with-default-describe-table-impl)
    (with-redefs [sql-jdbc.sync.interface/column->semantic-type (fn [_ _ column-name]
                                                                  (when (= (str/lower-case column-name) "longitude")
                                                                    :type/Longitude))]
      (is (= [["longitude" :type/Longitude]]
             (->> (sql-jdbc.describe-table/describe-table (or driver/*driver* :h2) (mt/id) (Table (mt/id :venues)))
                  :fields
                  (filter :semantic-type)
                  (map (juxt (comp str/lower-case :name) :semantic-type))))))))

(deftest type-by-parsing-string
  (testing "type-by-parsing-string"
    (is (= java.lang.String (#'sql-jdbc.describe-table/type-by-parsing-string "bleh")))
    (is (= java.time.LocalDateTime (#'sql-jdbc.describe-table/type-by-parsing-string "2017-01-13T17:09:42.411")))
    (is (= java.lang.Long (#'sql-jdbc.describe-table/type-by-parsing-string 11111)))))

(deftest row->types-test
  (testing "array rows ignored properly in JSON row->types (#21752)"
    (let [arr-row   {:bob [:bob :cob :dob 123 "blob"]}
          obj-row   {:zlob {"blob" 1323}}]
      (is (= {} (#'sql-jdbc.describe-table/row->types arr-row)))
      (is (= {[:zlob "blob"] java.lang.Long} (#'sql-jdbc.describe-table/row->types obj-row))))))

(deftest describe-nested-field-columns-test
  (testing "flattened-row"
    (let [row       {:bob {:dobbs 123 :cobbs "boop"}}
          flattened {[:mob :bob :dobbs] 123
                     [:mob :bob :cobbs] "boop"}]
      (is (= flattened (#'sql-jdbc.describe-table/flattened-row :mob row)))))
  (testing "row->types"
    (let [row   {:bob {:dobbs {:robbs 123} :cobbs [1 2 3]}}
          types {[:bob :cobbs] clojure.lang.PersistentVector
                 [:bob :dobbs :robbs] java.lang.Long}]
      (is (= types (#'sql-jdbc.describe-table/row->types row))))))

(deftest describe-nested-field-columns-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-field-columns)
    (testing "describes json columns and gives types for ones with coherent schemas only"
      (drop-if-exists-and-create-db! "describe-json-test")
      (let [details (mt/dbdef->connection-details :postgres :db {:database-name "describe-json-test"})
            spec    (sql-jdbc.conn/connection-details->spec :postgres details)]
        (jdbc/with-db-connection [conn (sql-jdbc.conn/connection-details->spec :postgres details)]
          (jdbc/execute! spec [(str "CREATE TABLE describe_json_table (coherent_json_val JSON NOT NULL, incoherent_json_val JSON NOT NULL);"
                                    "INSERT INTO describe_json_table (coherent_json_val, incoherent_json_val) VALUES ('{\"a\": 1, \"b\": 2, \"c\": \"2017-01-13T17:09:22.222\"}', '{\"a\": 1, \"b\": 2, \"c\": 3, \"d\": 44}');"
                                    "INSERT INTO describe_json_table (coherent_json_val, incoherent_json_val) VALUES ('{\"a\": 2, \"b\": 3, \"c\": \"2017-01-13T17:09:42.411\"}', '{\"a\": [1, 2], \"b\": \"blurgle\", \"c\": 3.22}');")]))
        (mt/with-temp Database [database {:engine :postgres, :details details}]
          (is (= :type/SerializedJSON
                 (->> (sql-jdbc.sync/describe-table :postgres database {:name "describe_json_table"})
                      (:fields)
                      (:take 1)
                      (first)
                      (:semantic-type))))
          (is (= '#{{:name              "incoherent_json_val → b",
                     :database-type     "text",
                     :base-type         :type/Text,
                     :database-position 0,
                     :nfc-path          [:incoherent_json_val "b"]
                     :visibility-type   :normal}
                    {:name              "coherent_json_val → a",
                     :database-type     "integer",
                     :base-type         :type/Integer,
                     :database-position 0,
                     :nfc-path          [:coherent_json_val "a"]
                     :visibility-type   :normal}
                    {:name              "coherent_json_val → b",
                     :database-type     "integer",
                     :base-type         :type/Integer,
                     :database-position 0,
                     :nfc-path          [:coherent_json_val "b"]
                     :visibility-type   :normal}
                    {:name "coherent_json_val → c",
                     :database-type     "timestamp",
                     :base-type         :type/DateTime,
                     :database-position 0,
                     :visibility-type   :normal,
                     :nfc-path          [:coherent_json_val "c"]}
                    {:name              "incoherent_json_val → c",
                     :database-type     "double precision",
                     :base-type         :type/Number,
                     :database-position 0,
                     :visibility-type   :normal,
                     :nfc-path          [:incoherent_json_val "c"]}
                    {:name              "incoherent_json_val → d",
                     :database-type     "integer",
                     :base-type         :type/Integer,
                     :database-position 0,
                     :visibility-type   :normal,
                     :nfc-path          [:incoherent_json_val "d"]}}
                 (sql-jdbc.sync/describe-nested-field-columns
                   :postgres
                   database
                   {:name "describe_json_table"}))))))))

(deftest describe-big-nested-field-columns-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-field-columns)
    (testing "blank out if huge. blank out instead of silently limiting"
      (drop-if-exists-and-create-db! "big-json-test")
      (let [details  (mt/dbdef->connection-details :postgres :db {:database-name "big-json-test"})
            spec     (sql-jdbc.conn/connection-details->spec :postgres details)
            big-map  (into {} (for [x (range 300)] [x :dobbs]))
            big-json (json/generate-string big-map)
            sql      (str "CREATE TABLE big_json_table (big_json JSON NOT NULL);"
                          (format "INSERT INTO big_json_table (big_json) VALUES ('%s');" big-json))]
        (jdbc/with-db-connection [conn (sql-jdbc.conn/connection-details->spec :postgres details)]
          (jdbc/execute! spec [sql]))
        (mt/with-temp Database [database {:engine :postgres, :details details}]
          (is (= #{}
                 (sql-jdbc.sync/describe-nested-field-columns
                  :postgres
                  database
                  {:name "big_json_table"}))))))))

(deftest json-alias-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-field-columns)
    (testing "json breakouts and order bys have alias coercion"
      (drop-if-exists-and-create-db! "json-alias-test")
      (let [details   (mt/dbdef->connection-details :postgres :db {:database-name "json-alias-test"})
            spec      (sql-jdbc.conn/connection-details->spec :postgres details)
            json-part (json/generate-string {:bob :dobbs})
            insert    (str "CREATE TABLE json_alias_test (json_part JSON NOT NULL);"
                         (format "INSERT INTO json_alias_test (json_part) VALUES ('%s');" json-part))]
        (jdbc/with-db-connection [conn (sql-jdbc.conn/connection-details->spec :postgres details)]
          (jdbc/execute! spec [insert]))
        (mt/with-temp* [Database [database    {:engine :postgres, :details details}]
                        Table    [table       {:db_id (u/the-id database) :name "json_alias_test"}]
                        Field    [field       {:table_id (u/the-id table)
                                               :nfc_path [:bob
                                                          "injection' OR 1=1--' AND released = 1"
                                                          (keyword "injection' OR 1=1--' AND released = 1")],
                                               :name     "json_alias_test"}]]
          (let [compile-res (qp/compile
                              {:database (u/the-id database)
                               :type     :query
                               :query    {:source-table (u/the-id table)
                                          :aggregation  [[:count]]
                                          :breakout     [[:field (u/the-id field) nil]]}})]
            (is (= (str "SELECT (\"json_alias_test\".\"bob\"#>> ?::text[])::VARCHAR  "
                        "AS \"json_alias_test\", count(*) AS \"count\" FROM \"json_alias_test\" "
                        "GROUP BY \"json_alias_test\" ORDER BY \"json_alias_test\" ASC")
                   (:query compile-res)))
            (is (= '("{injection' OR 1=1--' AND released = 1,injection' OR 1=1--' AND released = 1}") (:params compile-res)))))))))

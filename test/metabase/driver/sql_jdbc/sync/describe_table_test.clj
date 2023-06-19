(ns metabase.driver.sql-jdbc.sync.describe-table-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.mysql-test :as mysql-test]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync.describe-table
    :as sql-jdbc.describe-table]
   [metabase.driver.sql-jdbc.sync.interface :as sql-jdbc.sync.interface]
   [metabase.models.table :refer [Table]]
   [metabase.sync :as sync]
   [metabase.test :as mt]
   [metabase.test.data.one-off-dbs :as one-off-dbs]
   [metabase.util :as u]
   [toucan2.core :as t2]))

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
          #{{:name "ID", :database-type "BIGINT", :base-type :type/BigInteger, :database-position 0, :pk? true :database-required false :database-is-auto-increment true :json-unfolding false}
            {:name "NAME", :database-type "CHARACTER VARYING", :base-type :type/Text, :database-position 1 :database-required false :database-is-auto-increment false :json-unfolding false}
            {:name "CATEGORY_ID", :database-type "INTEGER", :base-type :type/Integer, :database-position 2 :database-required false :database-is-auto-increment false :json-unfolding false}
            {:name "LATITUDE", :database-type "DOUBLE PRECISION", :base-type :type/Float, :database-position 3 :database-required false :database-is-auto-increment false :json-unfolding false}
            {:name "LONGITUDE", :database-type "DOUBLE PRECISION", :base-type :type/Float, :database-position 4 :database-required false :database-is-auto-increment false :json-unfolding false}
            {:name "PRICE", :database-type "INTEGER", :base-type :type/Integer, :database-position 5 :database-required false :database-is-auto-increment false :json-unfolding false}}}
         (sql-jdbc.describe-table/describe-table :h2 (mt/id) {:name "VENUES"}))))

(deftest describe-auto-increment-on-non-pk-field-test
  (testing "a non-pk field with auto-increment should be have metabase_field.database_is_auto_increment=true"
    (one-off-dbs/with-blank-db
      (doseq [statement [;; H2 needs that 'guest' user for QP purposes. Set that up
                         "CREATE USER IF NOT EXISTS GUEST PASSWORD 'guest';"
                         ;; Keep DB open until we say otherwise :)
                         "SET DB_CLOSE_DELAY -1;"
                         ;; create table & load data
                         "DROP TABLE IF EXISTS \"birds\";"
                         "CREATE TABLE \"employee_counter\" (\"id\" INTEGER AUTO_INCREMENT PRIMARY KEY, \"count\" INTEGER AUTO_INCREMENT, \"rank\" INTEGER NOT NULL)"
                         "GRANT ALL ON \"employee_counter\" TO GUEST;"]]
        (jdbc/execute! one-off-dbs/*conn* [statement]))
      (sync/sync-database! (mt/db))
      (is (= {:fields #{{:base-type                 :type/Integer
                         :database-is-auto-increment true
                         :database-position         0
                         :database-required         false
                         :database-type             "INTEGER"
                         :name                      "id"
                         :pk?                       true
                         :json-unfolding            false}
                        {:base-type                 :type/Integer
                         :database-is-auto-increment true
                         :database-position         1
                         :database-required         false
                         :database-type             "INTEGER"
                         :name                      "count"
                         :json-unfolding            false}
                        {:base-type                 :type/Integer
                         :database-is-auto-increment false
                         :database-position         2
                         :database-required         true
                         :database-type             "INTEGER"
                         :name                      "rank"
                         :json-unfolding            false}}
              :name "employee_counter"}
             (sql-jdbc.describe-table/describe-table :h2 (mt/id) {:name "employee_counter"}))))))

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
               (->> (sql-jdbc.describe-table/describe-table driver/*driver* (mt/id) (t2/select-one Table :id (mt/id :venues)))
                    :fields
                    (map (fn [{:keys [name base-type]}]
                           {:name      (u/lower-case-en name)
                            :base-type (if (or (isa? base-type :type/Integer)
                                               (isa? base-type :type/Decimal)) ; H2 DBs returns the ID as BigInt, Oracle as Decimal;
                                         :type/Integer
                                         base-type)}))
                    set)))))))

(deftest calculated-semantic-type-test
  (mt/test-drivers (sql-jdbc-drivers-with-default-describe-table-impl)
    (with-redefs [sql-jdbc.sync.interface/column->semantic-type (fn [_ _ column-name]
                                                                  (when (= (u/lower-case-en column-name) "longitude")
                                                                    :type/Longitude))]
      (is (= [["longitude" :type/Longitude]]
             (->> (sql-jdbc.describe-table/describe-table (or driver/*driver* :h2) (mt/id) (t2/select-one Table :id (mt/id :venues)))
                  :fields
                  (filter :semantic-type)
                  (map (juxt (comp u/lower-case-en :name) :semantic-type))))))))

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
      (is (= {[:zlob "blob"] java.lang.Long} (#'sql-jdbc.describe-table/row->types obj-row)))))
  (testing "JSON row->types handles bigint OK (#21752)"
    (let [int-row   {:zlob {"blob" 123N}}
          float-row {:zlob {"blob" 1234.02M}}]
      (is (= {[:zlob "blob"] clojure.lang.BigInt} (#'sql-jdbc.describe-table/row->types int-row)))
      (is (= {[:zlob "blob"] java.math.BigDecimal} (#'sql-jdbc.describe-table/row->types float-row))))))

(deftest dont-parse-long-json-xform-test
  (testing "obnoxiously long json should not even get parsed (#22636)"
    ;; Generating an actually obnoxiously long json took too long,
    ;; and actually copy-pasting an obnoxiously long string in there looks absolutely terrible,
    ;; so this rebinding is what you get
    (let [obnoxiously-long-json "{\"bob\": \"dobbs\"}"
          json-map              {:somekey obnoxiously-long-json}]
      (with-redefs [sql-jdbc.describe-table/*nested-field-column-max-row-length* 3]
        (is (= {}
               (transduce
                 #'sql-jdbc.describe-table/describe-json-xform
                 #'sql-jdbc.describe-table/describe-json-rf [json-map]))))
      (is (= {[:somekey "bob"] java.lang.String}
             (transduce
               #'sql-jdbc.describe-table/describe-json-xform
               #'sql-jdbc.describe-table/describe-json-rf [json-map]))))))

(deftest json-details-only-test
  (testing "fields with base-type=type/JSON should have visibility-type=details-only, unlike other fields."
    (mt/test-drivers (mt/normal-drivers-with-feature :nested-field-columns)
      (when-not (mysql-test/is-mariadb? (u/id (mt/db)))
        (mt/dataset json
          (let [table (t2/select-one Table :id (mt/id :json))]
            (sql-jdbc.execute/do-with-connection-with-options
             driver/*driver*
             (mt/db)
             nil
             (fn [^java.sql.Connection conn]
               (let [fields     (sql-jdbc.describe-table/describe-table-fields driver/*driver* conn table nil)
                     json-field (first (filter #(= (:name %) "json_bit") fields))
                     text-field (first (filter #(= (:name %) "bloop") fields))]
                 (is (= :details-only
                        (:visibility-type json-field)))
                 (is (nil? (:visibility-type text-field))))))))))))

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
      (is (= types (#'sql-jdbc.describe-table/row->types row)))))
  (testing "JSON row->types handles bigint that comes in and gets interpreted as Java bigint OK (#22732)"
    (let [int-row   {:zlob {"blob" (java.math.BigInteger. "123124124312134235234235345344324352")}}]
      (is (= #{{:name              "zlob → blob",
                :database-type     "decimal",
                :base-type         :type/BigInteger,
                :database-position 0,
                :json-unfolding    false
                :visibility-type   :normal,
                :nfc-path          [:zlob "blob"]}}
             (-> int-row
                 (#'sql-jdbc.describe-table/row->types)
                 (#'sql-jdbc.describe-table/field-types->fields)))))))

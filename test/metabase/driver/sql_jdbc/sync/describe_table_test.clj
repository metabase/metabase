(ns metabase.driver.sql-jdbc.sync.describe-table-test
  (:require
   [cheshire.core :as json]
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.db.metadata-queries :as metadata-queries]
   [metabase.driver :as driver]
   [metabase.driver.mysql-test :as mysql-test]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
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

(deftest get-table-pks-test
  ;; FIXME: this should works for all sql drivers
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-field-columns)
    (sql-jdbc.execute/do-with-connection-with-options
     driver/*driver*
     (mt/db)
     nil
     (fn [conn]
       (is (= ["id"]
              (sql-jdbc.describe-table/get-table-pks driver/*driver* conn (:name (mt/db)) (t2/select-one :model/Table (mt/id :venues)))))))))

;;; ------------------------------------------- Tests for netsed field columns --------------------------------------------

(deftest json-details-only-test
  (testing "fields with base-type=type/JSON should have visibility-type=details-only, unlike other fields."
    (mt/test-drivers (mt/normal-drivers-with-feature :nested-field-columns)
      (when-not (mysql-test/is-mariadb? driver/*driver* (u/id (mt/db)))
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

(deftest nested-field-column-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-field-columns)
    (mt/dataset json
      (when-not (mysql-test/is-mariadb? driver/*driver*(u/id (mt/db)))
        (testing "Nested field column listing"
          (is (= [:type/JSON :type/SerializedJSON]
                 (->> (sql-jdbc.sync/describe-table driver/*driver* (mt/db) {:name "json"})
                      :fields
                      (filter #(= (:name %) "json_bit"))
                      first
                      ((juxt :base-type :semantic-type)))))
          (is (= #{{:name "json_bit → 1234123412314",
                    :database-type "timestamp",
                    :base-type :type/DateTime,
                    :database-position 0,
                    :json-unfolding false,
                    :visibility-type :normal,
                    :nfc-path [:json_bit "1234123412314"]}
                   {:name "json_bit → boop",
                    :database-type "timestamp",
                    :base-type :type/DateTime,
                    :database-position 0,
                    :json-unfolding false,
                    :visibility-type :normal,
                    :nfc-path [:json_bit "boop"]}
                   {:name "json_bit → genres",
                    :database-type "text",
                    :base-type :type/Array,
                    :database-position 0,
                    :json-unfolding false,
                    :visibility-type :normal,
                    :nfc-path [:json_bit "genres"]}
                   {:name "json_bit → 1234",
                    :database-type "bigint",
                    :base-type :type/Integer,
                    :database-position 0,
                    :json-unfolding false,
                    :visibility-type :normal,
                    :nfc-path [:json_bit "1234"]}
                   {:name "json_bit → doop",
                    :database-type "text",
                    :base-type :type/Text,
                    :database-position 0,
                    :json-unfolding false,
                    :visibility-type :normal,
                    :nfc-path [:json_bit "doop"]}
                   {:name "json_bit → noop",
                    :database-type "timestamp",
                    :base-type :type/DateTime,
                    :database-position 0,
                    :json-unfolding false,
                    :visibility-type :normal,
                    :nfc-path [:json_bit "noop"]}
                   {:name "json_bit → zoop",
                    :database-type "timestamp",
                    :base-type :type/DateTime,
                    :database-position 0,
                    :json-unfolding false,
                    :visibility-type :normal,
                    :nfc-path [:json_bit "zoop"]}
                   {:name "json_bit → published",
                    :database-type "text",
                    :base-type :type/Text,
                    :database-position 0,
                    :json-unfolding false,
                    :visibility-type :normal,
                    :nfc-path [:json_bit "published"]}
                   {:name "json_bit → title",
                    :database-type "text",
                    :base-type :type/Text,
                    :database-position 0,
                    :json-unfolding false,
                    :visibility-type :normal,
                    :nfc-path [:json_bit "title"]}}
               (sql-jdbc.sync/describe-nested-field-columns
                 driver/*driver*
                 (mt/db)
                 {:name "json" :id (mt/id "json")}))))))))

(mt/defdataset big-json
  [["big_json_table"
    [{:field-name "big_json" :base-type :type/JSON}]
    [[(json/generate-string (into {} (for [x (range 300)] [x :dobbs])))]]]])

(deftest describe-big-nested-field-columns-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-field-columns)
    (mt/dataset big-json
      (when-not (mysql-test/is-mariadb? driver/*driver* (u/id (mt/db)))
        (testing "limit if huge. limit it and yell warning (#23635)"
          (is (= sql-jdbc.describe-table/max-nested-field-columns
                 (count
                   (sql-jdbc.sync/describe-nested-field-columns
                     driver/*driver*
                     (mt/db)
                     {:name "big_json_table" :id (mt/id "big_json_table")}))))
          (is (str/includes?
                (get-in (mt/with-log-messages-for-level :warn
                          (sql-jdbc.sync/describe-nested-field-columns
                            driver/*driver*
                            (mt/db)
                            {:name "big_json_table" :id (mt/id "big_json_table")})) [0 2])
                "More nested field columns detected than maximum.")))))))

(deftest big-nested-field-column-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-field-columns)
    (mt/dataset json
      (when-not (mysql-test/is-mariadb? driver/*driver* (u/id (mt/db)))
        (testing "Nested field column listing, but big"
          (is (= sql-jdbc.describe-table/max-nested-field-columns
                 (count (sql-jdbc.sync/describe-nested-field-columns
                          driver/*driver*
                          (mt/db)
                          {:name "big_json" :id (mt/id "big_json")})))))))))

(mt/defdataset json-unwrap-bigint-and-boolean
  "Used for testing mysql json value unwrapping"
  [["bigint-and-bool-table"
    [{:field-name "jsoncol" :base-type :type/JSON}]
    [["{\"mybool\":true, \"myint\":1234567890123456789}"]
     ["{\"mybool\":false,\"myint\":12345678901234567890}"]
     ["{\"mybool\":true, \"myint\":123}"]]]])

(deftest json-unwrapping-bigint-and-boolean
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-field-columns)
    (when-not (mysql-test/is-mariadb? driver/*driver* (mt/id))
      (mt/dataset json-unwrap-bigint-and-boolean
        (sync/sync-database! (mt/db))
        (testing "Fields marked as :type/SerializedJSON are fingerprinted that way"
          (is (= #{{:name "id", :base_type :type/Integer, :semantic_type :type/PK}
                   {:name "jsoncol", :base_type :type/JSON, :semantic_type :type/SerializedJSON}
                   {:name "jsoncol → myint", :base_type :type/Number, :semantic_type :type/Category}
                   {:name "jsoncol → mybool", :base_type :type/Boolean, :semantic_type :type/Category}}
                 (mysql-test/db->fields (mt/db)))))
        (testing "Nested field columns are correct"
          (is (= #{{:name              "jsoncol → mybool"
                    :database-type     "boolean"
                    :base-type         :type/Boolean
                    :database-position 0
                    :json-unfolding    false
                    :visibility-type   :normal
                    :nfc-path          [:jsoncol "mybool"]}
                   {:name              "jsoncol → myint"
                    :database-type     "double precision"
                    :base-type         :type/Number
                    :database-position 0
                    :json-unfolding    false
                    :visibility-type   :normal
                    :nfc-path          [:jsoncol "myint"]}}
                 (sql-jdbc.sync/describe-nested-field-columns
                  driver/*driver*
                  (mt/db)
                  (t2/select-one Table :db_id (mt/id) :name "bigint-and-bool-table")))))))))

(mt/defdataset json-int-turn-string
  "Used for testing mysql json value unwrapping"
  [["json_without_pk"
    [{:field-name "json_col" :base-type :type/JSON}]
    [["{\"int_turn_string\":1}"]
     ["{\"int_turn_string\":2}"]
     ["{\"int_turn_string\":3}"]
     ["{\"int_turn_string\":4}"]
     ["{\"int_turn_string\":5}"]
     ;; last row turn to a string
     ["{\"int_turn_string\":\"6\"}"]]]
   ["json_with_pk"
    [{:field-name "json_col" :base-type :type/JSON}]
    [["{\"int_turn_string\":1}"]
     ["{\"int_turn_string\":2}"]
     ["{\"int_turn_string\":3}"]
     ["{\"int_turn_string\":4}"]
     ["{\"int_turn_string\":5}"]
     ;; last row turn to a string
     ["{\"int_turn_string\":\"6\"}"]]]])

;; Tests for composite pks are in driver specific ns
;; metabase.driver.postgres-test/sync-json-with-composite-pks-test
;; metabase.driver.mysql-test/sync-json-with-composite-pks-test

(deftest json-fetch-last-on-table-with-ids-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-field-columns)
    (let [original-get-table-pks sql-jdbc.describe-table/get-table-pks]
      ;; all table defined by `mt/defdataset` will have an pk column my default
      ;; so we need a little trick to test case that a table doesn't have a pk
      (with-redefs [sql-jdbc.describe-table/get-table-pks      (fn [driver conn db-name-or-nil table]
                                                                 (condp = (:name table)
                                                                   "json_without_pk"
                                                                   []

                                                                   (original-get-table-pks driver conn db-name-or-nil table)))
                    metadata-queries/nested-field-sample-limit 4]
        (mt/dataset json-int-turn-string
          (when-not (mysql-test/is-mariadb? driver/*driver* (mt/id))
            (sync/sync-database! (mt/db))
            (testing "if table has an pk, we fetch both first and last rows thus detect the change in type"
              (is (= #{{:name              "json_col → int_turn_string"
                        :database-type     "text"
                        :base-type         :type/Text
                        :database-position 0
                        :json-unfolding    false
                        :visibility-type   :normal
                        :nfc-path          [:json_col "int_turn_string"]}}
                     (sql-jdbc.sync/describe-nested-field-columns
                      driver/*driver*
                      (mt/db)
                      (t2/select-one Table :db_id (mt/id) :name "json_with_pk"))))

              (testing "if table doesn't have pk, we fail to detect the change in type but it still syncable"
                (is (= #{{:name              "json_col → int_turn_string"
                          :database-type     "bigint"
                          :base-type         :type/Integer
                          :database-position 0
                          :json-unfolding    false
                          :visibility-type   :normal
                          :nfc-path          [:json_col "int_turn_string"]}}
                       (sql-jdbc.sync/describe-nested-field-columns
                        driver/*driver*
                        (mt/db)
                        (t2/select-one Table :db_id (mt/id) :name "json_without_pk"))))))))))))

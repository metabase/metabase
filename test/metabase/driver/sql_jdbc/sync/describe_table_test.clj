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
      (is (= #{{:name "zlob → blob",
                :database-type "decimal",
                :base-type :type/BigInteger,
                :database-position 0,
                :visibility-type :normal,
                :nfc-path [:zlob "blob"]}}
             (-> int-row
                 (#'sql-jdbc.describe-table/row->types)
                 (#'sql-jdbc.describe-table/field-types->fields)))))))

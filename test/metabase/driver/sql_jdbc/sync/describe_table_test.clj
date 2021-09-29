(ns metabase.driver.sql-jdbc.sync.describe-table-test
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [clojure.test :refer :all]
            [metabase.driver :as driver]
            [metabase.driver.sql-jdbc.sync.describe-table :as describe-table]
            [metabase.driver.sql-jdbc.sync.interface :as i]
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
         (describe-table/describe-table :h2 (mt/id) {:name "VENUES"}))))

(deftest describe-table-fks-test
  (is (= #{{:fk-column-name   "CATEGORY_ID"
            :dest-table       {:name "CATEGORIES", :schema "PUBLIC"}
            :dest-column-name "ID"}}
         (describe-table/describe-table-fks :h2 (mt/id) {:name "VENUES"})))
  (is (= #{{:fk-column-name "USER_ID", :dest-table {:name "USERS", :schema "PUBLIC"}, :dest-column-name "ID"}
           {:fk-column-name "VENUE_ID", :dest-table {:name "VENUES", :schema "PUBLIC"}, :dest-column-name "ID"}}
         (describe-table/describe-table-fks :h2 (mt/id) {:name "CHECKINS"}))))

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
               (->> (describe-table/describe-table driver/*driver* (mt/id) (Table (mt/id :venues)))
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
    (with-redefs [i/column->semantic-type (fn [_ _ column-name]
                                           (when (= (str/lower-case column-name) "longitude")
                                             :type/Longitude))]
      (is (= [["longitude" :type/Longitude]]
             (->> (describe-table/describe-table (or driver/*driver* :h2) (mt/id) (Table (mt/id :venues)))
                  :fields
                  (filter :semantic-type)
                  (map (juxt (comp str/lower-case :name) :semantic-type))))))))

(ns ^:mb/driver-tests metabase.query-processor-test.cast-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [honey.sql :as sql]
   [malli.core :as mc]
   [medley.core :as m]
   [metabase.actions.error :as actions.error]
   [metabase.actions.models :as action]
   [metabase.config :as config]
   [metabase.db.metadata-queries :as metadata-queries]
   [metabase.driver :as driver]
   [metabase.driver.postgres :as postgres]
   [metabase.driver.postgres.actions :as postgres.actions]
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.sql-jdbc.actions :as sql-jdbc.actions]
   [metabase.driver.sql-jdbc.actions-test :as sql-jdbc.actions-test]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql-jdbc.sync.describe-database :as sql-jdbc.describe-database]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.query-processor-test-util :as sql.qp-test-util]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.metadata-providers.mock :as providers.mock]
   [metabase.models.secret :as secret]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.store :as qp.store]
   [metabase.sync.core :as sync]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.sync.sync-metadata.tables :as sync-tables]
   [metabase.sync.util :as sync-util]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log]
   [next.jdbc :as next.jdbc]
   [toucan2.core :as t2]))

;; integer()

(deftest ^:parallel integer-cast-table-fields
  (mt/test-drivers (mt/normal-drivers-with-feature :cast)
    (mt/dataset test-data
      (let [mp (mt/metadata-provider)]
        (doseq [[table fields] [[:people [{:field :zip :db-type "TEXT"}]]]
                {:keys [field db-type]} fields]
          (testing (str "casting " table "." field "(" db-type ") to integer")
            (let [field-md (lib.metadata/field mp (mt/id table field))
                  query (-> (lib/query mp (lib.metadata/table mp (mt/id table)))
                            (lib/with-fields [field-md])
                            (lib/expression "INTCAST" (lib/integer field-md))
                            (lib/limit 100))
                  result (-> query qp/process-query)
                  cols (mt/cols result)
                  rows (mt/rows result)]
              (is (= :type/BigInteger (-> cols last :base_type)))
              (doseq [[uncasted-value casted-value] rows]
                (is (= (Long/parseLong uncasted-value)
                       casted-value))))))))))

(deftest ^:parallel integer-cast-custom-expressions
  (mt/test-drivers (mt/normal-drivers-with-feature :cast)
    (mt/dataset test-data
      (let [mp (mt/metadata-provider)]
        (doseq [[table expressions] [[:people [{:expression (lib/concat
                                                             (lib.metadata/field mp (mt/id :people :id))
                                                             (lib.metadata/field mp (mt/id :people :zip)))
                                                :db-type "TEXT"}]]]
                {:keys [expression db-type]} expressions]
          (testing (str "Casting " db-type " to integer")
            (let [query (-> (lib/query mp (lib.metadata/table mp (mt/id table)))
                            (lib/with-fields [(lib.metadata/field mp (mt/id table :id))])
                            (lib/expression "UNCASTED" expression)
                            (as-> q
                                  (lib/expression q "INTCAST" (lib/integer (lib/expression-ref q "UNCASTED"))))
                            (lib/limit 10))
                  result (-> query qp/process-query)
                  cols (mt/cols result)
                  rows (mt/rows result)]
              (is (= :type/BigInteger (-> cols last :base_type)))
              (doseq [[_ uncasted-value casted-value] rows]
                (is (= (Long/parseLong uncasted-value)
                       casted-value))))))))))

(defn p [x]
  (prn x)
  x)

(deftest ^:parallel integer-cast-nested-native-query
  (mt/test-drivers (mt/normal-drivers-with-feature :cast)
    (mt/dataset test-data
      (let [mp (mt/metadata-provider)]
        (doseq [{:keys [expression db-type]} [{:expression "'123'"  :db-type "TEXT"}
                                              {:expression "'-123'" :db-type "TEXT"}]]
          (testing (str "Casting " db-type " to integer from native query")
            (let [native-query (mt/native-query {:query (str "SELECT " expression " AS UNCASTED")})]
              (mt/with-temp
                [:model/Card
                 {card-id :id}
                 (mt/card-with-source-metadata-for-query native-query)]
                (let [query (-> (lib/query mp (lib.metadata/card mp card-id))
                                (lib/with-fields [])
                                (as-> q
                                      (lib/expression q "UNCAST" (->> q lib/visible-columns (filter #(= "uncasted" (u/lower-case-en (:name %)))) first)))
                                (as-> q
                                      (lib/expression q "INTCAST" (lib/integer (->> q lib/visible-columns (filter #(= "uncasted" (u/lower-case-en (:name %)))) first)))))
                      result (-> query qp/process-query)
                      cols (mt/cols result)
                      rows (mt/rows result)]
                  (is (= :type/BigInteger (-> cols last :base_type)))
                  (doseq [[_ uncasted-value casted-value] rows]
                    (is (= (Long/parseLong uncasted-value)
                           casted-value))))))))))))

(deftest ^:parallel integer-cast-nested-query
  (mt/test-drivers (mt/normal-drivers-with-feature :cast)
    (mt/dataset test-data
      (let [mp (mt/metadata-provider)]
        (doseq [[table fields] [[:people [{:field :zip :db-type "TEXT"}]]]
                {:keys [field db-type]} fields]
          (let [nested-query (lib/query mp (lib.metadata/table mp (mt/id table)))]
            (testing (str "Casting " db-type " to integer")
              (mt/with-temp
                [:model/Card
                 {card-id :id}
                 (mt/card-with-source-metadata-for-query nested-query)]
                (let [field-md (lib.metadata/field mp (mt/id table field))
                      query (-> (lib/query mp (lib.metadata/card mp card-id))
                                (lib/with-fields [field-md])
                                (as-> q
                                      (lib/expression q "INTCAST" (lib/integer field-md)))
                                (lib/limit 100))
                      result (-> query qp/process-query)
                      cols (mt/cols result)
                      rows (mt/rows result)]
                  (is (= :type/BigInteger (-> cols last :base_type)))
                  (doseq [[uncasted-value casted-value] rows]
                    (is (= (Long/parseLong uncasted-value)
                           casted-value))))))))))))

(deftest ^:parallel integer-cast-nested-query-custom-expressions
  (mt/test-drivers (mt/normal-drivers-with-feature :cast)
    (mt/dataset test-data
      (let [mp (mt/metadata-provider)]
        (doseq [[table expressions] [[:people [{:expression (lib/concat
                                                             (lib.metadata/field mp (mt/id :people :id))
                                                             (lib.metadata/field mp (mt/id :people :zip)))
                                                :db-type "TEXT"}]]]
                {:keys [expression db-type]} expressions]
          (let [nested-query (-> (lib/query mp (lib.metadata/table mp (mt/id table)))
                                 (lib/with-fields [])
                                 (lib/expression "UNCASTED" expression)
                                 (lib/limit 10))]
            (testing (str "Casting " db-type " to integer")
              (mt/with-temp
                [:model/Card
                 {card-id :id}
                 (mt/card-with-source-metadata-for-query nested-query)]
                (let [query (-> (lib/query mp (lib.metadata/card mp card-id))
                                (lib/with-fields [(lib.metadata/field mp (mt/id table :id))])
                                (as-> q
                                      (lib/expression q "UNCAST" (->> q lib/visible-columns (filter #(= "UNCASTED" (:name %))) first)))
                                (as-> q
                                      (lib/expression q "INTCAST" (lib/integer (->> q lib/visible-columns (filter #(= "UNCASTED" (:name %))) first))))
                                (lib/limit 10))
                      result (-> query qp/process-query)
                      cols (mt/cols result)
                      rows (mt/rows result)]
                  (is (= :type/BigInteger (-> cols last :base_type)))
                  (doseq [[_ uncasted-value casted-value] rows]
                    (is (= (Long/parseLong uncasted-value)
                           casted-value))))))))))))

(deftest ^:parallel integer-cast-nested-custom-expressions
  (mt/test-drivers (mt/normal-drivers-with-feature :cast)
    (mt/dataset test-data
      (let [mp (mt/metadata-provider)]
        (doseq [[table expressions] [[:people [{:expression (fn []
                                                              (lib/concat
                                                               (lib.metadata/field mp (mt/id :people :id))
                                                               (lib.metadata/field mp (mt/id :people :zip))))}]]]
                {ex :expression} expressions]
          (let [query (-> (lib/query mp (lib.metadata/table mp (mt/id table)))
                          (lib/with-fields [(lib.metadata/field mp (mt/id table :id))])
                          (lib/expression "UNCASTED" (ex))
                          (lib/expression "INTCAST" (lib/integer (ex)))
                          (lib/limit 10))
                result (-> query qp/process-query)
                cols (mt/cols result)
                rows (mt/rows result)]
            (is (= :type/BigInteger (-> cols last :base_type)))
            (doseq [[_ uncasted-value casted-value] rows]
              (is (= (Long/parseLong uncasted-value)
                     casted-value)))))))))

(deftest ^:parallel integer-cast-aggregations
  (mt/test-drivers (mt/normal-drivers-with-feature :cast)
    (mt/dataset test-data
      (let [mp (mt/metadata-provider)]
        (doseq [[table fields] [[:people [{:field :zip}]]]
                {:keys [field]} fields]
          (testing (str "aggregating " table "." field " and casting to integer")
            (let [field-md (lib.metadata/field mp (mt/id table field))
                  query (-> (lib/query mp (lib.metadata/table mp (mt/id table)))
                            (lib/aggregate (lib/max field-md))
                            (lib/aggregate (lib/max (lib/integer field-md))))
                  result (-> query qp/process-query)
                  cols (mt/cols result)
                  rows (mt/rows result)]
              (is (= :type/BigInteger (-> cols last :base_type)))
              (doseq [[uncasted-value casted-value] rows]
                (is (= (Long/parseLong uncasted-value)
                       casted-value))))))))))

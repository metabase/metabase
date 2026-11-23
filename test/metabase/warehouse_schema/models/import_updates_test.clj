(ns metabase.warehouse-schema.models.import-updates-test
  "The update functions as a SerDes import and a setting that rewrites every name call them, with values of its own for
  every row."
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.warehouse-schema.models.dimension :as dimension]
   [metabase.warehouse-schema.models.field :as field]
   [metabase.warehouse-schema.models.field-user-settings :as field-user-settings]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [metabase.warehouse-schema.models.table :as table]
   [metabase.warehouse-schema.models.table-user-settings :as table-user-settings]
   [metabase.warehouses.models.database :as database]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest update-tables-and-fields-with-values-of-their-own-test
  (mt/with-temp [:model/Database {db-id :id} {}
                 :model/Table {t1 :id} {:db_id db-id :name "t1"}
                 :model/Table {t2 :id} {:db_id db-id :name "t2"}
                 :model/Field {f1 :id} {:table_id t1 :name "f1" :base_type :type/Text :database_type "TEXT"}
                 :model/Field {f2 :id} {:table_id t1 :name "f2" :base_type :type/Text :database_type "TEXT"}]
    (testing "tables"
      (table/update-tables! [{:id t1 :description "one"} {:id t2 :description "two"}])
      (is (= ["one" "two"] (t2/select-fn-vec :description :model/Table :id [:in [t1 t2]] {:order-by [:id]})))
      (table/update-tables! [{:id t1 :display_name "T One"} {:id t2 :display_name "T Two"}])
      (is (= ["T One" "T Two"] (t2/select-fn-vec :display_name :model/Table :id [:in [t1 t2]] {:order-by [:id]}))))
    (testing "fields"
      (field/update-fields! [{:id f1 :description "one"} {:id f2 :description "two"}])
      (is (= ["one" "two"] (t2/select-fn-vec :description :model/Field :id [:in [f1 f2]] {:order-by [:id]})))
      (field/update-fields! [{:id f1 :display_name "F One"} {:id f2 :display_name "F Two"}])
      (is (= ["F One" "F Two"] (t2/select-fn-vec :display_name :model/Field :id [:in [f1 f2]] {:order-by [:id]}))))))

(deftest update-settings-values-and-dimensions-with-values-of-their-own-test
  (mt/with-temp [:model/Database {db-id :id} {}
                 :model/Table {table-id :id} {:db_id db-id}
                 :model/Field {f1 :id} {:table_id table-id :name "f1" :base_type :type/Integer :database_type "INTEGER"}
                 :model/Field {f2 :id} {:table_id table-id :name "f2" :base_type :type/Integer :database_type "INTEGER"}
                 :model/Dimension {d1 :id} {:field_id f1 :type :internal :name "a"}
                 :model/Dimension {d2 :id} {:field_id f2 :type :internal :name "b"}
                 :model/FieldValues {v1 :id} {:field_id f1 :type :full :values [1]}
                 :model/FieldValues {v2 :id} {:field_id f2 :type :full :values [2]}
                 :model/FieldUserSettings {s1 :id} {:field_id f1 :description "x" :description_set true}
                 :model/FieldUserSettings {s2 :id} {:field_id f2 :description "y" :description_set true}
                 :model/TableUserSettings {ts :id} {:table_id table-id :caveats "c" :caveats_set true}]
    (testing "Dimensions"
      (dimension/update-dimensions! [{:id d1 :name "A"} {:id d2 :name "B"}])
      (is (= ["A" "B"] (t2/select-fn-vec :name :model/Dimension :id [:in [d1 d2]] {:order-by [:id]}))))
    (testing "FieldValues"
      (field-values/update-field-values! [{:id v1 :values [10]} {:id v2 :values [20]}])
      (is (= [[10] [20]] (t2/select-fn-vec :values :model/FieldValues :id [:in [v1 v2]] {:order-by [:id]}))))
    (testing "FieldUserSettings"
      (field-user-settings/update-field-user-settings! [{:id s1 :description "X"} {:id s2 :description "Y"}])
      (is (= ["X" "Y"] (t2/select-fn-vec :description :model/FieldUserSettings :id [:in [s1 s2]] {:order-by [:id]}))))
    (testing "TableUserSettings"
      (table-user-settings/update-table-user-settings! [{:id ts :caveats "C"}])
      (is (= "C" (t2/select-one-fn :caveats :model/TableUserSettings :id ts))))))

(deftest update-databases-as-import-test
  (mt/with-temp [:model/Database {id1 :id} {:name "import one" :engine :postgres :details {:host "localhost"}}
                 :model/Database {id2 :id} {:name "import two" :engine :postgres :details {:host "localhost"}}]
    (database/update-databases! [{:id id1 :description "one"} {:id id2 :description "two"}] {:writer :import})
    (is (= ["one" "two"] (t2/select-fn-vec :description :model/Database :id [:in [id1 id2]] {:order-by [:id]})))))

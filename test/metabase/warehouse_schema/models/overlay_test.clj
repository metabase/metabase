(ns metabase.warehouse-schema.models.overlay-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- raw-row
  "The row with `id` of the app DB table or view `relation`, with every column it has."
  [relation id]
  (t2/query-one {:select [:*] :from [relation] :where [:= :id [:inline id]]}))

(deftest overlay-columns-test
  (mt/with-temp [:model/Table table {}
                 :model/Field field {:table_id (:id table)}]
    (testing "views have exactly columns of their tables"
      (is (= (set (keys (raw-row :metabase_table (:id table))))
             (set (keys (raw-row :v_table_overlay (:id table))))))
      (is (= (set (keys (raw-row :metabase_field (:id field))))
             (set (keys (raw-row :v_field_overlay (:id field)))))))))

(deftest table-overlay-test
  (mt/with-temp [:model/Table             table {:display_name "Sync name" :description "Sync description"
                                                 :caveats "Sync caveats"}
                 :model/TableUserSettings _     {:table_id (:id table) :display_name "User name" :description nil}]
    (let [overlay (t2/select-one :model/TableOverlay :id (:id table))]
      (testing "user values win, including cleared description"
        (is (= {:display_name "User name" :description nil}
               (select-keys overlay [:display_name :description]))))
      (testing "columns users did not set keep table's values"
        (is (= "Sync caveats" (:caveats overlay))))
      (testing "overlay rows hydrate like Tables"
        (is (= (:db_id table) (:id (:db (t2/hydrate overlay :db))))))
      (testing "writes through overlay are refused"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"read-only"
                              (t2/update! :model/TableOverlay :id (:id table) {:display_name "Renamed"})))))))

(deftest field-overlay-test
  (mt/with-temp [:model/Table             table {}
                 :model/Field             field {:table_id      (:id table)
                                                 :display_name  "Sync name"
                                                 :description   "Sync description"
                                                 :semantic_type :type/Category}
                 :model/FieldUserSettings _     {:field_id (:id field) :display_name "User name" :description nil}]
    (let [overlay (t2/select-one :model/FieldOverlay :id (:id field))]
      (testing "user values win, including cleared description"
        (is (= {:display_name "User name" :description nil}
               (select-keys overlay [:display_name :description]))))
      (testing "columns users did not set keep field's values"
        (is (= :type/Category (:semantic_type overlay))))
      (testing "writes through overlay are refused"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"read-only"
                              (t2/update! :model/FieldOverlay :id (:id field) {:display_name "Renamed"})))))))

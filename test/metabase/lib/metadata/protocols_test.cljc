(ns metabase.lib.metadata.protocols-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]))

(defn- filter-ids [spec tables]
  (into [] (comp (lib.metadata.protocols/default-spec-filter-xform spec)
                 (map :id))
        tables))

(deftest ^:parallel default-spec-filter-xform-schema-test
  (let [tables [{:lib/type :metadata/table :id 1 :name "ORDERS" :schema "RAW"}
                {:lib/type :metadata/table :id 2 :name "ORDERS" :schema "CLEAN"}
                {:lib/type :metadata/table :id 3 :name "EVENTS"  :schema nil}]]
    (testing "absent :schema key → no schema filter"
      (is (= #{1 2 3} (set (filter-ids {:lib/type :metadata/table} tables)))))
    (testing "string :schema → only that schema"
      (is (= [1] (filter-ids {:lib/type :metadata/table :schema "RAW"} tables))))
    (testing "nil :schema → only null-schema tables (schemaless databases)"
      (is (= [3] (filter-ids {:lib/type :metadata/table :schema nil} tables))))
    (testing ":schema disambiguates same-named tables alongside :name"
      (is (= [2] (filter-ids {:lib/type :metadata/table :name #{"ORDERS"} :schema "CLEAN"} tables))))))

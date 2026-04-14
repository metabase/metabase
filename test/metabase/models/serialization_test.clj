(ns metabase.models.serialization-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.models.serialization :as serdes]))

(deftest ^:parallel drop-mbql-5-uuids-on-export-test
  (binding [serdes/*export-field-fk* (constantly ::field-id)]
    (is (= [:field {} :metabase.models.serialization-test/field-id]
           (#'serdes/export-mbql-ref [:field {:lib/uuid "00000000-0000-0000-0000-000000000001"} 1])))
    (binding [serdes/*required-lib-uuids-for-export* #{"00000000-0000-0000-0000-000000000001"}]
      (is (= [:field {:lib/uuid "00000000-0000-0000-0000-000000000001"} :metabase.models.serialization-test/field-id]
             (#'serdes/export-mbql-ref [:field {:lib/uuid "00000000-0000-0000-0000-000000000001"} 1])))
      (is (= [:field {} :metabase.models.serialization-test/field-id]
             (#'serdes/export-mbql-ref [:field {:lib/uuid "00000000-0000-0000-0000-000000000002"} 1]))))))

(deftest ^:parallel drop-mbql-5-uuids-on-export-test-2
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                  (lib/filter (lib/= (meta/field-metadata :venues :id) 1))
                  (lib/aggregate (-> (lib/count)
                                     (lib/update-options assoc :lib/uuid "00000000-0000-0000-0000-000000000000")))
                  (as-> $query (lib/order-by $query (first (lib/aggregations-metadata $query)))))]
    (is (= #{"00000000-0000-0000-0000-000000000000"}
           (#'serdes/collect-required-lib-uuids query)))
    (binding [serdes/*export-database-fk* (constantly "DATABASE")
              serdes/*export-table-fk*    (constantly ["DATABASE" "SCHEMA" "TABLE"])
              serdes/*export-field-fk*    (constantly ["DATABASE" "SCHEMA" "TABLE" "FIELD"])]
      (is (= {:lib/type :mbql/query
              :database "DATABASE"
              :stages   [{:lib/type     :mbql.stage/mbql
                          :source-table ["DATABASE" "SCHEMA" "TABLE"]
                          :filters      [[:=
                                          {}
                                          [:field
                                           {:effective-type :type/BigInteger, :base-type :type/BigInteger}
                                           ["DATABASE" "SCHEMA" "TABLE" "FIELD"]]
                                          1]]
                          :aggregation  [[:count {:name "aggregation" :lib/uuid "00000000-0000-0000-0000-000000000000"}]]
                          :order-by     [[:asc
                                          {}
                                          [:aggregation
                                           {:base-type       :type/Integer
                                            :effective-type  :type/Integer
                                            :lib/source-name "aggregation"}
                                           "00000000-0000-0000-0000-000000000000"]]]}]}
             (serdes/export-mbql query))))))

(deftest ^:parallel hydrate-mbql-5-uuids-on-import-test
  ;; when read out of the YAML, map keys should get keywordized but not other strings
  (let [query {:lib/type "mbql/query"
               :database "DATABASE"
               :stages   [{:lib/type     "mbql.stage/mbql"
                           :source-table ["DATABASE" "SCHEMA" "TABLE"]
                           :filters      [["="
                                           {}
                                           ["field"
                                            {:effective-type "type/BigInteger", :base-type "type/BigInteger"}
                                            ["DATABASE" "SCHEMA" "TABLE" "FIELD"]]
                                           1]]
                           :aggregation  [["count" {:lib/uuid "00000000-0000-0000-0000-000000000000"}]]
                           :order-by     [["asc"
                                           {}
                                           [:aggregation {:base-type       "type/Integer"
                                                          :effective-type  "type/Integer"
                                                          :lib/source-name "count"}
                                            "00000000-0000-0000-0000-000000000000"]]]}]}]
    (binding [serdes/*import-database-fk* (constantly 1)
              serdes/*import-table-fk*    (constantly 2)
              serdes/*import-field-fk*    (constantly 3)]
      (is (=? {:lib/type :mbql/query
               :database 1
               :stages   [{:lib/type     :mbql.stage/mbql
                           :source-table 2
                           :filters      [[:=
                                           {:lib/uuid string?}
                                           [:field
                                            {:lib/uuid       string?
                                             :effective-type :type/BigInteger
                                             :base-type      :type/BigInteger}
                                            3]
                                           1]]
                           :aggregation  [[:count {:lib/uuid "00000000-0000-0000-0000-000000000000"}]]
                           :order-by     [[:asc
                                           {:lib/uuid string?}
                                           [:aggregation
                                            {:base-type       :type/Integer
                                             :effective-type  :type/Integer
                                             :lib/source-name "count"}
                                            "00000000-0000-0000-0000-000000000000"]]]}]}
              (serdes/import-mbql query))))))

(deftest ^:parallel hydrate-mbql-5-uuids-on-import-test-2
  (binding [serdes/*import-field-fk* (constantly 3)]
    (are [x expected] (=? expected
                          (serdes/import-mbql x))
      ["field" {} ["DB" "SCHEMA" "TABLE" "FIELD"]]
      [:field {:lib/uuid string?} 3]

      ["dimension" ["field" ["DB" "SCHEMA" "TABLE" "FIELD"] {:source-field ["DB" "SCHEMA" "TABLE" "FIELD2"]}]]
      [:dimension [:field 3 {:source-field 3}]])))

(deftest ^:parallel export-mbql-3-field-id-ref-in-viz-settings-test
  (testing "Allegedly viz settings can still contain MBQL 3 `:field-id` refs, make sure we export them properly"
    (binding [serdes/*export-field-fk* (constantly ["A" "B" "C" "D"])]
      (are [clause expected] (= expected
                                (#'serdes/export-mbql clause))

        [:field-id 1]
        [:field-id ["A" "B" "C" "D"]]

        ["field-id" 1]
        [:field-id ["A" "B" "C" "D"]]

        [:fk-> [:field-id 1] [:field-id 2]]
        [:fk-> [:field-id ["A" "B" "C" "D"]] [:field-id ["A" "B" "C" "D"]]]

        ["fk->" ["field-id" 1] ["field-id" 2]]
        ["fk->" [:field-id ["A" "B" "C" "D"]] [:field-id ["A" "B" "C" "D"]]]))))

(deftest ^:parallel export-visualization-settings-test
  (binding [serdes/*export-field-fk* (constantly ["A" "B" "C" "D"])
            serdes/*export-fk*       (fn [id model]
                                       (format "%s___%d" (name model) id))]
    (is (= {:column_settings
            {"[\"ref\",[\"field\",[\"A\",\"B\",\"C\",\"D\"],null]]"
             {:column_title "Locus"
              :click_behavior
              {:type     "link"
               :linkType "question"
               :targetId "Card___1"
               :parameterMapping
               {"[\"dimension\",[\"field\",[\"A\",\"B\",\"C\",\"D\"],{\"source-field\":[\"A\",\"B\",\"C\",\"D\"]}]]"
                {:id     "[\"dimension\",[\"field\",[\"A\",\"B\",\"C\",\"D\"],{\"source-field\":[\"A\",\"B\",\"C\",\"D\"]}]]"
                 :source {:type "column", :id "Category_ID", :name "Category ID"}
                 :target {:type      "dimension"
                          :id        "[\"dimension\",[\"field\",[\"A\",\"B\",\"C\",\"D\"],{\"source-field\":[\"A\",\"B\",\"C\",\"D\"]}]]"
                          :dimension [:dimension [:field ["A" "B" "C" "D"] {:source-field ["A" "B" "C" "D"]}]]}}}}}}}
           (serdes/export-visualization-settings
            {:column_settings
             {"[\"ref\",[\"field\",54,null]]"
              {:column_title "Locus"
               :click_behavior
               {:type     "link"
                :linkType "question"
                :targetId 1
                :parameterMapping
                {(keyword "[\"dimension\",[\"field\",54,{\"source-field\":53}]]")
                 {:id     "[\"dimension\",[\"field\",54,{\"source-field\":53}]]"
                  :source {:type "column", :id "Category_ID", :name "Category ID"}
                  :target {:type      "dimension"
                           :id        "[\"dimension\",[\"field\",54,{\"source-field\":53}]]"
                           :dimension ["dimension" [:field 54 {:source-field 53}]]}}}}}}})))))

(deftest ^:parallel import-viz-settings-test
  (binding [serdes/*import-field-fk* (constantly 3)]
    (is (= {:column_settings
            {"[\"ref\",[\"field\",3,null]]"
             {:click_behavior
              {:parameterMapping
               {"[\"dimension\",[\"field\",3,{\"source-field\":3}]]"
                {:id     "[\"dimension\",[\"field\",3,{\"source-field\":3}]]"
                 :target {:type      "dimension"
                          :dimension [:dimension [:field 3 {:source-field 3}]]
                          :id        "[\"dimension\",[\"field\",3,{\"source-field\":3}]]"}}}}}}}
           (serdes/import-visualization-settings
            {:column_settings
             {"[\"ref\",[\"field\",[\"my-db\",null,\"orders\",\"invoice\"],null]]"
              {:click_behavior
               {:parameterMapping
                {"[\"dimension\",[\"field\",[\"my-db\",null,\"orders\",\"invoice\"],{\"source-field\":[\"my-db\",null,\"orders\",\"subtotal\"]}]]"
                 {:id     "[\"dimension\",[\"field\",[\"my-db\",null,\"orders\",\"invoice\"],{\"source-field\":[\"my-db\",null,\"orders\",\"subtotal\"]}]]"
                  :target {:type      "dimension"
                           :dimension [:dimension
                                       [:field
                                        ["my-db" nil "orders" "invoice"]
                                        {:source-field ["my-db" nil "orders" "subtotal"]}]]
                           :id        "[\"dimension\",[\"field\",[\"my-db\",null,\"orders\",\"invoice\"],{\"source-field\":[\"my-db\",null,\"orders\",\"subtotal\"]}]]"}}}}}}})))))

(deftest ^:parallel export-import-template-tag-table-id-test
  (testing "template tags of type :table serialize their :table-id as a portable tuple"
    (let [template-tags {"table" {:id           "abc"
                                  :name         "table"
                                  :display-name "Table"
                                  :type         :table
                                  :table-id     42}}
          exported      (binding [serdes/*export-table-fk* (constantly ["DB" "SCHEMA" "TABLE"])]
                          (serdes/export-mbql template-tags))]
      (is (= {"table" {:id           "abc"
                       :name         "table"
                       :display-name "Table"
                       :type         :table
                       :table-id     ["DB" "SCHEMA" "TABLE"]}}
             exported))
      (is (= 42
             (binding [serdes/*import-table-fk* (constantly 42)]
               (get-in (#'serdes/import-mbql* exported) ["table" :table-id])))))))

(deftest ^:parallel template-tag-table-id-deps-test
  (testing "template tag :table-id contributes a Table dependency"
    (is (contains? (#'serdes/mbql-deps-map {:table-id ["DB" "SCHEMA" "TABLE"]})
                   [{:model "Database" :id "DB"}
                    {:model "Schema" :id "SCHEMA"}
                    {:model "Table" :id "TABLE"}]))))

(deftest ^:parallel export-parameters-test
  (binding [serdes/*export-fk*       (fn [id model]
                                       (format "%s___%d" (name model) id))
            serdes/*export-field-fk* (constantly ["DATABASE" "SCHEMA" "TABLE" "FIELD"])]
    (is (= [{:id                   "abc"
             :name                 "CATEGORY"
             :position             0
             :type                 :category
             :values_source_config {:card_id     "Card___1"
                                    :value_field [:field ["DATABASE" "SCHEMA" "TABLE" "FIELD"] nil]}
             :values_source_type   :card}]
           (serdes/export-parameters [{:id                   "abc"
                                       :type                 :category
                                       :name                 "CATEGORY"
                                       :values_source_type   :card
                                       :values_source_config {:card_id 1, :value_field [:field 53 nil]}
                                       :position             0}])))))

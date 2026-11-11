(ns metabase.lib.visualization-settings-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase.lib.core :as lib]))

(deftest ^:parallel parse-column-settings-key-test
  (testing "keys referring to a Field by id or to a column by name are parsed, others are not"
    (are [k expected] (= expected (lib/parse-column-settings-key k))
      "[\"name\",\"A\"]"                                 {:column-name "A"}
      "[\"ref\",[\"expression\",\"E\"]]"                 {:column-name "E"}
      "[\"ref\",[\"field\",1,null]]"                     {:field-id 1, :field-options nil}
      "[\"ref\",[\"field\",1,{\"base-type\":\"type/Integer\"}]]" {:field-id 1, :field-options {"base-type" "type/Integer"}}
      "[\"ref\",[\"field\",\"TOTAL\",null]]"             nil
      "[\"ref\",[\"aggregation\",0]]"                    nil
      "not json"                                         nil
      nil                                                nil)))

(deftest ^:parallel column-settings-key-round-trip-test
  (testing "the keys built for a Field id or a column name parse back to it"
    (is (= {:field-id 7, :field-options nil}
           (lib/parse-column-settings-key (lib/field-id->column-settings-key 7))))
    (is (= {:column-name "Total"}
           (lib/parse-column-settings-key (lib/column-name->column-settings-key "Total"))))))

(deftest ^:parallel ref->column-settings-key-test
  (testing "a ref is keyed by the legacy reference it converts to, which parses back to the column it refers to"
    (let [field-ref      (lib/normalize :mbql.clause/field [:field {:lib/uuid "00000000-0000-0000-0000-000000000000"} 7])
          expression-ref (lib/normalize :mbql.clause/expression [:expression {:lib/uuid "00000000-0000-0000-0000-000000000001"} "E"])]
      (is (= {:field-id 7, :field-options nil}
             (lib/parse-column-settings-key (lib/ref->column-settings-key field-ref))))
      (is (= {:column-name "E"}
             (lib/parse-column-settings-key (lib/ref->column-settings-key expression-ref)))))))

(deftest ^:parallel column-settings-lookup-test
  (let [viz-settings {:column_settings {"[\"ref\",[\"field\",1,{\"base-type\":\"type/Integer\"}]]" {:column_title "By id"}
                                        "[\"name\",\"B\"]"                                       {:column_title "By name"}
                                        "[\"ref\",[\"expression\",\"E\"]]"                       {:column_title "By expression"}}}]
    (testing "a Field is found by id whatever the options of its reference"
      (is (= {:column_title "By id"} (lib/column-settings-for-field-id viz-settings 1))))
    (testing "a column is found by name, given as a name key or an expression reference"
      (is (= {:column_title "By name"} (lib/column-settings-for-name viz-settings "B")))
      (is (= {:column_title "By expression"} (lib/column-settings-for-name viz-settings "E"))))
    (testing "nothing is found for unknown columns or values that can't name one"
      (is (nil? (lib/column-settings-for-field-id viz-settings 2)))
      (is (nil? (lib/column-settings-for-field-id viz-settings "1")))
      (is (nil? (lib/column-settings-for-name viz-settings "C")))
      (is (nil? (lib/column-settings-for-name viz-settings nil))))))

(ns metabase.util.visualization-settings-test
  (:require [clojure.test :refer :all]
            [metabase.util.visualization-settings :as viz]
            [java-time :as t]))

(deftest name-for-column
  (let [viz-settings {:column_settings {"[\"ref\",[\"field\",14,null]]" {:column_title "Renamed Column"
                                                                         :date_style   "YYYY/M/D"
                                                                         :time_enabled "minutes"
                                                                         :time_style   "k:mm"}}}
        col          {:id 14}]
    (testing "name-from-col-settings works as expected"
             (is (= "Renamed Column"
                    (viz/column-title-override viz-settings col))))
    (testing "date-format-from-col-settings works as expected"
      (is (= "YYYY/MM/D k:mm"
             (viz/date-format-from-col-settings viz-settings col))))))

(deftest momentjs-format-strings-test
  (let [test-date (t/local-date-time 2021 3 3 14 39 27 876000000)]
    (doseq [[expected date_style date_abbreviate time_style time_enabled]
            [["Wednesday, March 3, 2021" "dddd, MMMM D, YYYY" false nil nil]
             ["Wed, Mar 3, 2021" "dddd, MMMM D, YYYY" true nil nil]
             ["Wednesday, March 3, 2021, 2:39 PM" "dddd, MMMM D, YYYY" false "h:mm A" "minutes"]
             ["Wed, Mar 3, 2021, 2:39 PM" "dddd, MMMM D, YYYY" true "h:mm A" "minutes"]
             ["Wed, Mar 3, 2021, 14:39:27:876" "dddd, MMMM D, YYYY" true "k:mm" "milliseconds"]]]
      (testing (format "Formatting date results in \"%s\"" expected)
        (let [col-setting {:date_style date_style :date_abbreviate date_abbreviate
                           :time_style time_style :time_enabled time_enabled}]
          (is (= expected
                 ((viz/date-format-fn col-setting) test-date))))))))

(deftest format-functions-from-vis-settings-test
  (let [field-id-1   143
        field-id-2   299
        col-ref-id   (format "[\"ref\",[\"field\",%s,null]]" field-id-1)
        col-ref-id-2 (format "[\"ref\",[\"field\",%s,null]]" field-id-2)
        col-ref-expr "[\"ref\",[\"expression\",\"CREATED_AT_MINUS_ONE_DAY\"]]"
        viz-settings {:column_settings {col-ref-id   {:column_title "Grand Total"}
                                        col-ref-expr {:date_style   "YYYY/M/D"
                                                      :time_enabled "minutes"
                                                      :time_style   "k:mm"}
                                        col-ref-id-2 {:decimals          2
                                                      :number_separators ".,"
                                                      :number_style      "decimal"
                                                      :prefix            "<"
                                                      :suffix            ">"}}}
        id-col       {:description     "The total billed amount."
                      :semantic_type   nil,
                      :table_id        37,
                      :name            "TOTAL",
                      :settings        nil,
                      :source          :fields,
                      :field_ref       [:field field-id-1 nil],
                      :parent_id       nil,
                      :id              field-id-1,
                      :visibility_type :normal,
                      :display_name    "Total",
                      :fingerprint     {:global {:distinct-count 4426, :nil% 0.0}}
                      :type            {:type/Number {:min 8.93914247937167, :q1 51.34535490743823,
                                                      :q3 110.29428389265787, :max 159.34900526552292,
                                                      :sd 34.26469575709948, :avg 80.35871658771228}},
                      :base_type       :type/Float}
        id-col-2     (assoc id-col :description  "The subtotal before tax"
                                   :id           field-id-2
                                   :field_ref    [:field field-id-2 nil]
                                   :display_name "Subtotal"
                                   :name         "SUBTOTAL")
        expr-col     {:base_type       :type/DateTime,
                      :semantic_type   :type/CreationTimestamp,
                      :name            "CREATED_AT_MINUS_ONE_DAY",
                      :display_name    "CREATED_AT_MINUS_ONE_DAY",
                      :expression_name "CREATED_AT_MINUS_ONE_DAY",
                      :field_ref       [:expression "CREATED_AT_MINUS_ONE_DAY"],
                      :source          :fields}
        test-date    (t/local-date-time 2021 1 21 13 5)
        test-total   12124.43
        test-subtot  10941.9]
    (testing "correct format function for dates created for column"
      (let [fmt-md-expr (viz/make-format-metadata viz-settings expr-col)
            fmt-md-id   (viz/make-format-metadata viz-settings id-col)
            fmt-md-id-2 (viz/make-format-metadata viz-settings id-col-2)]
        ;; format fn should be defined in both cases
        (is (contains? fmt-md-expr ::viz/format-fn))
        (is (contains? fmt-md-id ::viz/format-fn))
        ;; format fn for the expr column should work based on the viz settings
        (is (= "2021/1/21, 13:05" ((::viz/format-fn fmt-md-expr) test-date)))
        ;; format fn for the id column should use a default impl from protocol fn
        (is (= test-total ((::viz/format-fn fmt-md-id) test-total)))
        ;; format fn for id column 2 should use the decimal formatting viz settings
        (is (= "<10,941.90>" ((::viz/format-fn fmt-md-id-2) test-subtot)))))
    (testing ":column_title picked up for expression"
      (is (= "Grand Total"
             (viz/column-title-override viz-settings id-col))))))

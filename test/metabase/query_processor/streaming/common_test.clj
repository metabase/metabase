(ns metabase.query-processor.streaming.common-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.lib.core :as lib]
   [metabase.query-processor.streaming.common :as streaming.common]
   [metabase.test :as mt]
   [metabase.util.date-2 :as u.date]))

(set! *warn-on-reflection* true)

(deftest export-filename-timestamp-test
  (testing "Export filename reflects the current time in the report timezone"
    (let [test-timezone "America/Los_Angeles"]
      (mt/with-temporary-setting-values [report-timezone test-timezone]
        (mt/with-clock (t/zoned-date-time (t/instant) test-timezone)
          (let [now-in-report-zone           (t/zoned-date-time (t/instant) test-timezone)
                filename-time                (u.date/parse (streaming.common/export-filename-timestamp))
                filename-time-in-report-zone (t/zoned-date-time filename-time test-timezone)]
            (is (= now-in-report-zone filename-time-in-report-zone))))))))

(deftest currency-identifier-test
  (testing "narrowSymbol style returns symbol_native"
    (testing "USD symbol_native is $ (same as symbol)"
      (is (= "$" (streaming.common/currency-identifier {:currency "USD"
                                                        :currency_style "narrowSymbol"}))))
    (testing "CAD symbol_native is $ (differs from symbol CA$)"
      (is (= "$" (streaming.common/currency-identifier {:currency "CAD"
                                                        :currency_style "narrowSymbol"}))))
    (testing "EUR symbol_native is €"
      (is (= "€" (streaming.common/currency-identifier {:currency "EUR"
                                                        :currency_style "narrowSymbol"})))))
  (testing "narrowSymbol falls back to code if symbol not supported"
    (is (= "KGS" (streaming.common/currency-identifier {:currency "KGS"
                                                        :currency_style "narrowSymbol"})))))

(deftest column-titles-test
  (testing "column titles properly merge settings from multiple references to the same column"
    (let [ordered-cols [{:name "CREATED_AT" :id 13 :display_name "Created At"}]
          ;; The column settings map has map keys with field references
          ;; and values with the settings for those columns
          viz-settings {:column_settings
                        {(lib/field-id->column-settings-key 13)
                         {:time_enabled "milliseconds"}

                         (lib/column-name->column-settings-key "CREATED_AT")
                         {:column_title "test 7"}}}
          format-rows? true
          titles (streaming.common/column-titles ordered-cols viz-settings format-rows?)]
      (testing "both settings (title and time) should be applied to the same column"
        (is (= ["test 7"] titles))))))

(deftest column-titles-test-merge-order
  (testing "column-title setting precedence when the same column has multiple settings"
    (let [ordered-cols [{:name "AMOUNT" :id 42 :display_name "Amount"}]
          format-rows? true]
      (testing "column-name settings override field-id settings"
        (let [viz-settings {:column_settings
                            {;; Field ID column setting
                             (lib/field-id->column-settings-key 42)
                             {:column_title "Field ID Title"}

                             ;; Column name setting (should take precedence)
                             (lib/column-name->column-settings-key "AMOUNT")
                             {:column_title "Column Name Title"}}}
              titles (streaming.common/column-titles ordered-cols viz-settings format-rows?)]
          (is (= ["Column Name Title"] titles)))))))

(deftest ^:parallel viz-settings-for-col-malformed-column-settings-test
  (testing "a malformed value in a column's stored :settings is dropped instead of killing the export (SEC-868)"
    (doseq [bad-click-behavior ["x" [1 2] 42 true]]
      (testing (str "click_behavior = " (pr-str bad-click-behavior))
        (let [col {:name           "N"
                   :display_name   "N"
                   :base_type      :type/Integer
                   :effective_type :type/Integer
                   :field_ref      [:field "N" {:base-type :type/Integer}]
                   :source         :native
                   :settings       {:click_behavior bad-click-behavior}}
              settings (streaming.common/viz-settings-for-col col {})]
          (is (map? settings))
          (is (not (contains? settings :click_behavior))))))
    (testing "well-formed sibling entries in the same :settings map survive"
      (let [col      {:name      "N"
                      :base_type :type/Integer
                      :field_ref [:field "N" {:base-type :type/Integer}]
                      :settings  {:click_behavior "x"
                                  :column_title   "Legit Title"}}
            settings (streaming.common/viz-settings-for-col col {})]
        (is (= "Legit Title" (:column_title settings)))))
    (testing "a well-formed :click_behavior is still normalized"
      (let [col      {:name      "N"
                      :base_type :type/Integer
                      :field_ref [:field "N" {:base-type :type/Integer}]
                      :settings  {:click_behavior {:type "link" :linkType "url" :linkTextTemplate "http://example.com"}}}
            settings (streaming.common/viz-settings-for-col col {})]
        (is (= {:type "link" :linkType "url" :linkTextTemplate "http://example.com"}
               (:click_behavior settings)))))))

(deftest escape-spreadsheet-formula-test
  (testing "values that a spreadsheet would evaluate as a formula are prefixed with a single quote"
    (are [v] (= (str "'" v) (streaming.common/escape-spreadsheet-formula v))
      "=1+1"
      "=cmd|' /C calc'!A0"
      "+cmd|' /C calc'!A0"
      "-cmd|' /C calc'!A0"
      "@SUM(1+1)"
      "=HYPERLINK(\"http://evil.example\",\"click me\")"
      "-2+3"
      "\t=1+1"
      "\r=1+1"))
  (testing "ordinary values are left alone"
    (are [v] (= v (streaming.common/escape-spreadsheet-formula v))
      nil
      ""
      "hello"
      "a=b"
      "Sale: 50% off"
      " =1+1"))
  (testing "values a spreadsheet reads as plain numbers are left alone, so exports stay faithful"
    (are [v] (= v (streaming.common/escape-spreadsheet-formula v))
      "-5"
      "+5"
      "-1,234.56"
      "-1’234.56\u00a0€"
      "-2 US dollars"
      "-$1,234.56"
      "-1,234.56\u00a0€"
      "-1,234.56\u00a0EUR"
      "-1,234.56\u00a0USD"
      "-1,234.56 EUR"
      "-1,234.56 USD"
      "-2\u00a0CA$"
      "-2\u00a0kr"
      "-2\u00a0CN¥"
      "-2\u00a0SL Re"
      "-50%"
      "-1.5e3"
      "+1 555 1234"))
  (testing "currency-like text with formula syntax still requires escaping"
    (are [v] (= (str "'" v) (streaming.common/escape-spreadsheet-formula v))
      "-1’234.56+1"
      "-2 US dollars+1"
      "-1,234.56\u00a0EUR+1"
      "-1,234.56\u00a0USD|cmd!A0"
      "-1,234.56 EUR(1)"
      "-1,234.56\u00a0EUR\n=1+1"
      "-1,234.56EUR"
      "-2\u00a0CA$+1"
      "-2\u00a0kr|cmd!A0"
      "-2\u00a0CN¥(1)"
      "-2\u00a0SL Re\n=1+1"
      "-2\u00a0arbitrary"))
  (testing "non-string values pass through untouched"
    (are [v] (= v (streaming.common/escape-spreadsheet-formula v))
      5
      -5
      true
      :kw)))

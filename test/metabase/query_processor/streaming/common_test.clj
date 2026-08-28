(ns metabase.query-processor.streaming.common-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.models.visualization-settings :as mb.viz]
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
      (is (= "$" (streaming.common/currency-identifier {::mb.viz/currency "USD"
                                                        ::mb.viz/currency-style "narrowSymbol"}))))
    (testing "CAD symbol_native is $ (differs from symbol CA$)"
      (is (= "$" (streaming.common/currency-identifier {::mb.viz/currency "CAD"
                                                        ::mb.viz/currency-style "narrowSymbol"}))))
    (testing "EUR symbol_native is €"
      (is (= "€" (streaming.common/currency-identifier {::mb.viz/currency "EUR"
                                                        ::mb.viz/currency-style "narrowSymbol"})))))
  (testing "narrowSymbol falls back to code if symbol not supported"
    (is (= "KGS" (streaming.common/currency-identifier {::mb.viz/currency "KGS"
                                                        ::mb.viz/currency-style "narrowSymbol"})))))

(deftest column-titles-test
  (testing "column titles properly merge settings from multiple references to the same column"
    (let [ordered-cols [{:name "CREATED_AT" :id 13 :display_name "Created At"}]
          ;; The column settings map has map keys with field references
          ;; and values with the settings for those columns
          viz-settings {::mb.viz/column-settings
                        {{::mb.viz/field-id 13}
                         {::mb.viz/time-enabled "milliseconds"}

                         {::mb.viz/column-name "CREATED_AT"}
                         {::mb.viz/column-title "test 7"}}}
          format-rows? true
          titles (streaming.common/column-titles ordered-cols viz-settings format-rows?)]
      (testing "both settings (title and time) should be applied to the same column"
        (is (= ["test 7"] titles))))))

(deftest column-titles-test-merge-order
  (testing "column-title setting precedence when the same column has multiple settings"
    (let [ordered-cols [{:name "AMOUNT" :id 42 :display_name "Amount"}]
          format-rows? true]
      (testing "column-name settings override field-id settings"
        (let [viz-settings {::mb.viz/column-settings
                            {;; Field ID column setting
                             {::mb.viz/field-id 42}
                             {::mb.viz/column-title "Field ID Title"}

                             ;; Column name setting (should take precedence)
                             {::mb.viz/column-name "AMOUNT"}
                             {::mb.viz/column-title "Column Name Title"}}}
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
          (is (not (contains? settings ::mb.viz/click-behavior))))))
    (testing "well-formed sibling entries in the same :settings map survive"
      (let [col      {:name      "N"
                      :base_type :type/Integer
                      :field_ref [:field "N" {:base-type :type/Integer}]
                      :settings  {:click_behavior "x"
                                  :column_title   "Legit Title"}}
            settings (streaming.common/viz-settings-for-col col {})]
        (is (= "Legit Title" (::mb.viz/column-title settings)))))
    (testing "a well-formed :click_behavior is still normalized"
      (let [col      {:name      "N"
                      :base_type :type/Integer
                      :field_ref [:field "N" {:base-type :type/Integer}]
                      :settings  {:click_behavior {:type "link" :linkType "url" :linkTextTemplate "http://example.com"}}}
            settings (streaming.common/viz-settings-for-col col {})]
        (is (= {::mb.viz/click-behavior-type ::mb.viz/link
                ::mb.viz/link-type           ::mb.viz/url
                ::mb.viz/link-text-template  "http://example.com"}
               (::mb.viz/click-behavior settings)))))))

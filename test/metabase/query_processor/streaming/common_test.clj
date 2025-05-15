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

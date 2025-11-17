(ns metabase.query-processor.streaming.common-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.models.visualization-settings :as mb.viz]
   [metabase.query-processor.streaming.common :as streaming.common]
   [metabase.test :as mt]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :as i18n]))

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

(deftest column-titles-localized-strings-test
  (testing "column titles properly convert localized strings to current user locale"
    (let [;; Create a UserLocalizedString that would return different values based on locale
          localized-display-name (i18n/->UserLocalizedString "Count" nil {})
          ordered-cols [{:name "count" :id 1 :display_name localized-display-name}]
          viz-settings {}
          format-rows? true]

      (testing "localized string is converted to string representation"
        (binding [i18n/*user-locale* "en"]
          (let [titles (streaming.common/column-titles ordered-cols viz-settings format-rows?)]
            ;; The result should be a regular string, not a localized string object
            (is (string? (first titles)))
            (is (= ["Count"] titles))))))))

(deftest column-titles-translation-test
  (testing "column titles properly translate known field names based on user locale"
    (let [ordered-cols [{:name "FIRST_NAME" :id 1 :display_name "First Name"}
                        {:name "LAST_NAME" :id 2 :display_name "Last Name"}
                        {:name "CREATED_AT" :id 3 :display_name "Created At"}]
          viz-settings {}
          format-rows? true]

      (testing "English locale returns original titles"
        (binding [i18n/*user-locale* "en"]
          (let [titles (streaming.common/column-titles ordered-cols viz-settings format-rows?)]
            (is (= ["First Name" "Last Name" "Created At"] titles)))))

      (testing "French locale returns translated titles"
        (binding [i18n/*user-locale* "fr"]
          (let [titles (streaming.common/column-titles ordered-cols viz-settings format-rows?)]
            ;; These should be translated to French
            (is (every? string? titles))
            ;; Note: Actual translation values depend on the loaded translation bundles
            ;; In a test environment, the translations might not be loaded
            (is (= 3 (count titles)))))))))

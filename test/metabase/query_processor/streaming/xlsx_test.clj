(ns metabase.query-processor.streaming.xlsx-test
  (:require [clojure.test :refer :all]
            [metabase.query-processor.streaming.xlsx :as xlsx]
            [metabase.shared.models.visualization-settings :as mb.viz]))

(defn- format-string
  [format-settings]
  (@#'xlsx/format-settings->format-string format-settings))

(deftest format-settings->format-string-test
  (testing "Empty format settings don't produce a format string"
    (is (nil? (format-string {}))))

  (testing "General number formatting"
    (testing "number-style (non-currency)"
      (is (= (format-string {::mb.viz/number-style "decimal"})    "General"))
      (is (= (format-string {::mb.viz/number-style "percent"})    "#,##0.00%"))
      (is (= (format-string {::mb.viz/number-style "scientific"}) "#,##0.00E+0")))

    (testing "Decimals"
      (is (= (format-string {::mb.viz/decimals 0 ::mb.viz/number-style "decimal"})     "#,##0"))
      (is (= (format-string {::mb.viz/decimals 0 ::mb.viz/number-style "percent"})     "#,##0%"))
      (is (= (format-string {::mb.viz/decimals 0 ::mb.viz/number-style "scientific"})  "#,##0E+0"))
      (is (= (format-string {::mb.viz/decimals 0
                             ::mb.viz/currency-in-header false
                             ::mb.viz/number-style "currency"})                        "[$$]#,##0"))
      (is (= (format-string {::mb.viz/decimals 3 ::mb.viz/number-style "decimal"})     "#,##0.000"))
      (is (= (format-string {::mb.viz/decimals 3 ::mb.viz/number-style "percent"})     "#,##0.000%"))
      (is (= (format-string {::mb.viz/decimals 3 ::mb.viz/number-style "scientific"})  "#,##0.000E+0"))
      (is (= (format-string {::mb.viz/decimals 3
                             ::mb.viz/currency-in-header false
                             ::mb.viz/number-style "currency"})                        "[$$]#,##0.000"))
      ;; Negative decimal values not supported (unlike on frontend); falls back to 0
      (is (= (format-string {::mb.viz/decimals -1 ::mb.viz/number-style "decimal"})    "#,##0"))
      (is (= (format-string {::mb.viz/decimals -1 ::mb.viz/number-style "percent"})    "#,##0%"))
      (is (= (format-string {::mb.viz/decimals -1 ::mb.viz/number-style "scientific"}) "#,##0E+0"))
      (is (= (format-string {::mb.viz/decimals -1
                             ::mb.viz/currency-in-header false
                             ::mb.viz/number-style "currency"})                        "[$$]#,##0")))

    (testing "Scale"
      ;; Scale should not affect format string since it is applied to the actual data prior to export
      (is (= (format-string {::mb.viz/scale 2})                     "General"))
      (is (= (format-string {::mb.viz/scale 2 ::mb.viz/decimals 2}) "#,##0.00")))

    (testing "Prefix and suffix"
      ;; Prefix/suffix on general number format
      (is (= (format-string {::mb.viz/prefix "prefix"})                          "\"prefix\"General"))
      (is (= (format-string {::mb.viz/suffix "suffix"})                          "General\"suffix\""))
      (is (= (format-string {::mb.viz/prefix "prefix" ::mb.viz/suffix "suffix"}) "\"prefix\"General\"suffix\""))
      ;; Prefix/suffix on number format w/fixed decimal count
      (is (= (format-string {::mb.viz/decimals 2
                             ::mb.viz/prefix "prefix"})                          "\"prefix\"#,##0.00"))
      (is (= (format-string {::mb.viz/decimals 2
                             ::mb.viz/suffix "suffix"})                          "#,##0.00\"suffix\""))
      (is (= (format-string {::mb.viz/decimals 2
                             ::mb.viz/prefix "prefix"
                             ::mb.viz/suffix "suffix"})                          "\"prefix\"#,##0.00\"suffix\""))
      ;; Prefix/suffix on percentage
      (is (= (format-string {::mb.viz/number-style "percent"
                             ::mb.viz/prefix "prefix"
                             ::mb.viz/suffix "suffix"})                          "\"prefix\"#,##0.00%\"suffix\""))
      ;; Prefix/suffix on scientific notation
      (is (= (format-string {::mb.viz/number-style "scientific"
                             ::mb.viz/prefix "prefix"
                             ::mb.viz/suffix "suffix"})                          "\"prefix\"#,##0.00E+0\"suffix\""))
      ;; Prefix/suffix on currency
      (is (= (format-string {::mb.viz/currency-in-header false
                             ::mb.viz/number-style "currency"
                             ::mb.viz/prefix "prefix"
                             ::mb.viz/suffix "suffix"})                          "\"prefix\"[$$]#,##0.00\"suffix\""))))

  (testing "Currency formatting"
    (testing "Default currency formatting is dollar sign"
      (is (= (format-string {::mb.viz/currency-in-header false}) "[$$]#,##0.00")))

    (testing "Uses native currency symbol if supported"
      (is (= (format-string {::mb.viz/currency-in-header false ::mb.viz/currency "USD"}) "[$$]#,##0.00"))
      (is (= (format-string {::mb.viz/currency-in-header false ::mb.viz/currency "CAD"}) "[$CA$]#,##0.00"))
      (is (= (format-string {::mb.viz/currency-in-header false ::mb.viz/currency "EUR"}) "[$€]#,##0.00"))
      (is (= (format-string {::mb.viz/currency-in-header false ::mb.viz/currency "JPY"}) "[$¥]#,##0.00")))

    (testing "Falls back to code if native symbol not supported"
      (is (= (format-string {::mb.viz/currency-in-header false
                             ::mb.viz/currency "KGS"})          "[$KGS] #,##0.00"))
      (is (= (format-string {::mb.viz/currency-in-header false
                             ::mb.viz/currency "KGS"
                             ::mb.viz/currency-style "symbol"}) "[$KGS] #,##0.00")))

    (testing "Respects currency-style option"
      (is (= (format-string {::mb.viz/currency-in-header false ::mb.viz/currency-style "symbol"}) "[$$]#,##0.00"))
      (is (= (format-string {::mb.viz/currency-in-header false ::mb.viz/currency-style "code"})   "[$USD] #,##0.00"))
      (is (= (format-string {::mb.viz/currency-in-header false ::mb.viz/currency-style "name"})   "#,##0.00\" US dollars\""))
      (is (= (format-string {::mb.viz/currency-in-header false
                             ::mb.viz/currency "EUR"
                             ::mb.viz/currency-style "symbol"})                                   "[$€]#,##0.00"))
      (is (= (format-string {::mb.viz/currency-in-header false
                             ::mb.viz/currency "EUR"
                             ::mb.viz/currency-style "code"})                                     "[$EUR] #,##0.00"))
      (is (= (format-string {::mb.viz/currency-in-header false
                             ::mb.viz/currency "EUR"
                             ::mb.viz/currency-style "name"})                                     "#,##0.00\" euros\"")))

    (testing "Formatting options are ignored if currency-in-header is true or absent (defaults to true)"
      (is (= (format-string {::mb.viz/currency-style "symbol"})                           "#,##0.00"))
      (is (= (format-string {::mb.viz/currency-style "name"})                             "#,##0.00"))
      (is (= (format-string {::mb.viz/currency-style "code"})                             "#,##0.00"))
      (is (= (format-string {::mb.viz/currency "USD"})                                    "#,##0.00"))
      (is (= (format-string {::mb.viz/currency "EUR"})                                    "#,##0.00"))
      (is (= (format-string {::currency-in-header true ::mb.viz/currency-style "symbol"}) "#,##0.00"))
      (is (= (format-string {::currency-in-header true ::mb.viz/currency-style "name"})   "#,##0.00"))
      (is (= (format-string {::currency-in-header true ::mb.viz/currency-style "code"})   "#,##0.00"))
      (is (= (format-string {::currency-in-header true ::mb.viz/currency "USD"})          "#,##0.00"))
      (is (= (format-string {::currency-in-header true ::mb.viz/currency "EUR"})          "#,##0.00"))))

  (testing "Datetime formatting"
    (testing "date-style"
      (is (= (format-string {::mb.viz/date-style "M/D/YYYY"})           "M/D/YYYY, H:MM AM/PM"))
      (is (= (format-string {::mb.viz/date-style "D/M/YYYY"})           "D/M/YYYY, H:MM AM/PM"))
      (is (= (format-string {::mb.viz/date-style "YYYY/M/D"})           "YYYY/M/D, H:MM AM/PM"))
      (is (= (format-string {::mb.viz/date-style "MMMM D, YYYY"})       "MMMM D, YYYY, H:MM AM/PM"))
      (is (= (format-string {::mb.viz/date-style "DMMMM, YYYY"})        "DMMMM, YYYY, H:MM AM/PM"))
      (is (= (format-string {::mb.viz/date-style "dddd, MMMM D, YYYY"}) "dddd, MMMM D, YYYY, H:MM AM/PM")))

    (testing "date-separator"
      (is (= (format-string {::mb.viz/date-style "M/D/YYYY" ::mb.viz/date-separator "/"}) "M/D/YYYY, H:MM AM/PM"))
      (is (= (format-string {::mb.viz/date-style "M/D/YYYY" ::mb.viz/date-separator "."}) "M.D.YYYY, H:MM AM/PM"))
      (is (= (format-string {::mb.viz/date-style "M/D/YYYY" ::mb.viz/date-separator "-"}) "M-D-YYYY, H:MM AM/PM")))

    (testing "date-abbreviate"
      (is (= (format-string {::mb.viz/date-abbreviate true})            "MMM D, YYYY, H:MM AM/PM"))
      (is (= (format-string {::mb.viz/date-abbreviate false})           "MMMM D, YYYY, H:MM AM/PM"))
      (is (= (format-string {::mb.viz/date-abbreviate true
                             ::mb.viz/date-style "dddd, MMMM D, YYYY"}) "ddd, MMM D, YYYY, H:MM AM/PM"))
      (is (= (format-string {::mb.viz/date-abbreviate false
                             ::mb.viz/date-style "dddd, MMMM D, YYYY"}) "dddd, MMMM D, YYYY, H:MM AM/PM")))

    (testing "time-style"
      (is (= (format-string {::mb.viz/time-style "HH:mm"})  "MMMM D, YYYY, HH:MM"))
      (is (= (format-string {::mb.viz/time-style "h:mm A"}) "MMMM D, YYYY, H:MM AM/PM"))
      (is (= (format-string {::mb.viz/time-style "h A"})    "MMMM D, YYYY, H AM/PM")))

    (testing "time-enabled"
      (is (= (format-string {::mb.viz/time-enabled nil})            "MMMM D, YYYY"))
      (is (= (format-string {::mb.viz/time-enabled "minutes"})      "MMMM D, YYYY, H:MM AM/PM"))
      (is (= (format-string {::mb.viz/time-enabled "seconds"})      "MMMM D, YYYY, H:MM:SS AM/PM"))
      (is (= (format-string {::mb.viz/time-enabled "milliseconds"}) "MMMM D, YYYY, H:MM:SS.000 AM/PM"))
      ;; time-enabled overrides time-styled
      (is (= (format-string {::mb.viz/time-style "h:mm A"
                             ::mb.viz/time-enabled nil})            "MMMM D, YYYY")))

    (testing "misc combinations"
      (is (= (format-string {::mb.viz/date-style "YYYY/M/D"
                             ::mb.viz/date-separator "."
                             ::mb.viz/time-style "h:mm A"
                             ::mb.viz/time-enabled "seconds"}) "YYYY.M.D, H:MM:SS AM/PM"))
      (is (= (format-string {::mb.viz/date-style "dddd, MMMM D, YYYY"
                             ::mb.viz/time-style "HH:mm"
                             ::mb.viz/time-enabled "milliseconds"}) "dddd, MMMM D, YYYY, HH:MM:SS.000")))))

; (defrecord ^:private SampleNastyClass [^String v])

; (generate/add-encoder
;  SampleNastyClass
;  (fn [obj, ^JsonGenerator json-generator]
;    (.writeString json-generator (str (:v obj)))))

; (defrecord ^:private AnotherNastyClass [^String v])

; (deftest encode-strange-classes-test
;   (testing (str "Make sure that we're piggybacking off of the JSON encoding logic when encoding strange values in "
;                 "XLSX (#5145, #5220, #5459)")
;     (is (= [{"Values" "values"}
;             ;; should use the JSON encoding implementation for object
;             {"Values" "Hello XLSX World!"}
;             ;; fall back to the implementation of `str` for an object if no JSON encoder exists rather than barfing
;             {"Values" "{:v \"No Encoder\"}"}
;             {"Values" "ABC"}]
;            (->> (spreadsheet/create-workbook "Results" [["values"]
;                                                         [(SampleNastyClass. "Hello XLSX World!")]
;                                                         [(AnotherNastyClass. "No Encoder")]
;                                                         ["ABC"]])
;                 (spreadsheet/select-sheet "Results")
;                 (spreadsheet/select-columns {:A "Values"}))))))

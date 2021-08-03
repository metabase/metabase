(ns metabase.query-processor.streaming.xlsx-test
  (:require [clojure.test :refer :all]
            [cheshire.generate :as generate]
            [dk.ative.docjure.spreadsheet :as spreadsheet]
            [metabase.query-processor.streaming.interface :as i]
            [metabase.query-processor.streaming.xlsx :as xlsx]
            [metabase.shared.models.visualization-settings :as mb.viz])
  (:import [java.io BufferedInputStream BufferedOutputStream ByteArrayInputStream ByteArrayOutputStream]
           com.fasterxml.jackson.core.JsonGenerator))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                     Format string generation unit tests                                        |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- format-string
  [format-settings]
  (@#'xlsx/format-settings->format-string format-settings))

(deftest format-settings->format-string-test
  (testing "Empty format settings don't produce a format string"
    (is (nil? (format-string {}))))

  (testing "General number formatting"
    (testing "number-style (non-currency)"
      (is (= "General"     (format-string {::mb.viz/number-style "decimal"})))
      (is (= "#,##0.00%"   (format-string {::mb.viz/number-style "percent"})))
      (is (= "#,##0.00E+0" (format-string {::mb.viz/number-style "scientific"}))))

    (testing "Decimals"
      (is (= "#,##0"     (format-string {::mb.viz/decimals 0, ::mb.viz/number-style "decimal"})))
      (is (= "#,##0%"    (format-string {::mb.viz/decimals 0, ::mb.viz/number-style "percent"})))
      (is (= "#,##0E+0"  (format-string {::mb.viz/decimals 0, ::mb.viz/number-style "scientific"})))
      (is (= "[$$]#,##0" (format-string {::mb.viz/decimals 0,
                                         ::mb.viz/currency-in-header false,
                                         ::mb.viz/number-style "currency"})))
      (is (= "#,##0.000"     (format-string {::mb.viz/decimals 3, ::mb.viz/number-style "decimal"})))
      (is (= "#,##0.000%"    (format-string {::mb.viz/decimals 3, ::mb.viz/number-style "percent"})))
      (is (= "#,##0.000E+0"  (format-string {::mb.viz/decimals 3, ::mb.viz/number-style "scientific"})))
      (is (= "[$$]#,##0.000" (format-string {::mb.viz/decimals 3,
                                             ::mb.viz/currency-in-header false,
                                             ::mb.viz/number-style "currency"})))
      ;; Negative decimal values not supported (unlike on frontend); falls back to 0
      (is (= "#,##0"     (format-string {::mb.viz/decimals -1, ::mb.viz/number-style "decimal"})))
      (is (= "#,##0%"    (format-string {::mb.viz/decimals -1, ::mb.viz/number-style "percent"})))
      (is (= "#,##0E+0"  (format-string {::mb.viz/decimals -1, ::mb.viz/number-style "scientific"})))
      (is (= "[$$]#,##0" (format-string {::mb.viz/decimals -1,
                                         ::mb.viz/currency-in-header false,
                                         ::mb.viz/number-style "currency"}))))

    (testing "Scale"
      ;; Scale should not affect format string since it is applied to the actual data prior to export
      (is (= "General"  (format-string {::mb.viz/scale 2})))
      (is (= "#,##0.00" (format-string {::mb.viz/scale 2, ::mb.viz/decimals 2}))))

    (testing "Prefix and suffix"
      ;; Prefix/suffix on general number format
      (is (= "\"prefix\"General"                (format-string {::mb.viz/prefix "prefix"})))
      (is (= "General\"suffix\""                (format-string {::mb.viz/suffix "suffix"})))
      (is (= "\"prefix\"General\"suffix\""      (format-string {::mb.viz/prefix "prefix", ::mb.viz/suffix "suffix"})))
      ;; Prefix/suffix on number format w/fixed decimal count
      (is (= "\"prefix\"#,##0.00"               (format-string {::mb.viz/decimals 2,
                                                                ::mb.viz/prefix "prefix"})))
      (is (= "#,##0.00\"suffix\""               (format-string {::mb.viz/decimals 2,
                                                                ::mb.viz/suffix "suffix"})))
      (is (= "\"prefix\"#,##0.00\"suffix\""     (format-string {::mb.viz/decimals 2,
                                                                ::mb.viz/prefix "prefix",
                                                                ::mb.viz/suffix "suffix"})))
      ;; Prefix/suffix on percentage
      (is (= "\"prefix\"#,##0.00%\"suffix\""    (format-string {::mb.viz/number-style "percent",
                                                                ::mb.viz/prefix "prefix",
                                                                ::mb.viz/suffix "suffix"})))
      ;; Prefix/suffix on scientific notation
      (is (= "\"prefix\"#,##0.00E+0\"suffix\""  (format-string {::mb.viz/number-style "scientific",
                                                                ::mb.viz/prefix "prefix",
                                                                ::mb.viz/suffix "suffix"})))
      ;; Prefix/suffix on currency
      (is (= "\"prefix\"[$$]#,##0.00\"suffix\"" (format-string {::mb.viz/currency-in-header false,
                                                                ::mb.viz/number-style "currency",
                                                                ::mb.viz/prefix "prefix",
                                                                ::mb.viz/suffix "suffix"})))))

  (testing "Currency formatting"
    (testing "Default currency formatting is dollar sign"
      (is (= "[$$]#,##0.00" (format-string {::mb.viz/currency-in-header false}))))

    (testing "Uses native currency symbol if supported"
      (is (= "[$$]#,##0.00"   (format-string {::mb.viz/currency-in-header false, ::mb.viz/currency "USD"})))
      (is (= "[$CA$]#,##0.00" (format-string {::mb.viz/currency-in-header false, ::mb.viz/currency "CAD"})))
      (is (= "[$€]#,##0.00"   (format-string {::mb.viz/currency-in-header false, ::mb.viz/currency "EUR"})))
      (is (= "[$¥]#,##0.00"   (format-string {::mb.viz/currency-in-header false, ::mb.viz/currency "JPY"}))))

    (testing "Falls back to code if native symbol not supported"
      (is (= "[$KGS] #,##0.00" (format-string {::mb.viz/currency-in-header false,
                                               ::mb.viz/currency "KGS"})))
      (is (= "[$KGS] #,##0.00" (format-string {::mb.viz/currency-in-header false,
                                               ::mb.viz/currency "KGS",
                                               ::mb.viz/currency-style "symbol"}))))

    (testing "Respects currency-style option"
      (is (= "[$$]#,##0.00"            (format-string {::mb.viz/currency-in-header false, ::mb.viz/currency-style "symbol"})))
      (is (= "[$USD] #,##0.00"         (format-string {::mb.viz/currency-in-header false, ::mb.viz/currency-style "code"})))
      (is (= "#,##0.00\" US dollars\"" (format-string {::mb.viz/currency-in-header false, ::mb.viz/currency-style "name"})))
      (is (= "[$€]#,##0.00"            (format-string {::mb.viz/currency-in-header false,
                                                       ::mb.viz/currency "EUR",
                                                       ::mb.viz/currency-style "symbol"})))
      (is (= "[$EUR] #,##0.00"         (format-string {::mb.viz/currency-in-header false,
                                                       ::mb.viz/currency "EUR",
                                                       ::mb.viz/currency-style "code"})))
      (is (= "#,##0.00\" euros\""      (format-string {::mb.viz/currency-in-header false,
                                                       ::mb.viz/currency "EUR",
                                                       ::mb.viz/currency-style "name"}))))

    (testing "Formatting options are ignored if currency-in-header is true or absent (defaults to true)"
      (is (= "#,##0.00" (format-string {::mb.viz/currency-style "symbol"})))
      (is (= "#,##0.00" (format-string {::mb.viz/currency-style "name"})))
      (is (= "#,##0.00" (format-string {::mb.viz/currency-style "code"})))
      (is (= "#,##0.00" (format-string {::mb.viz/currency "USD"})))
      (is (= "#,##0.00" (format-string {::mb.viz/currency "EUR"})))
      (is (= "#,##0.00" (format-string {::currency-in-header true, ::mb.viz/currency-style "symbol"})))
      (is (= "#,##0.00" (format-string {::currency-in-header true, ::mb.viz/currency-style "name"})))
      (is (= "#,##0.00" (format-string {::currency-in-header true, ::mb.viz/currency-style "code"})))
      (is (= "#,##0.00" (format-string {::currency-in-header true, ::mb.viz/currency "USD"})))
      (is (= "#,##0.00" (format-string {::currency-in-header true, ::mb.viz/currency "EUR"})))))

  (testing "Datetime formatting"
    (testing "date-style"
      (is (= "M/D/YYYY, H:MM AM/PM"           (format-string {::mb.viz/date-style "M/D/YYYY"})))
      (is (= "D/M/YYYY, H:MM AM/PM"           (format-string {::mb.viz/date-style "D/M/YYYY"})))
      (is (= "YYYY/M/D, H:MM AM/PM"           (format-string {::mb.viz/date-style "YYYY/M/D"})))
      (is (= "MMMM D, YYYY, H:MM AM/PM"       (format-string {::mb.viz/date-style "MMMM D, YYYY"})))
      (is (= "DMMMM, YYYY, H:MM AM/PM"        (format-string {::mb.viz/date-style "DMMMM, YYYY"})))
      (is (= "dddd, MMMM D, YYYY, H:MM AM/PM" (format-string {::mb.viz/date-style "dddd, MMMM D, YYYY"}))))

    (testing "date-separator"
      (is (= "M/D/YYYY, H:MM AM/PM" (format-string {::mb.viz/date-style "M/D/YYYY", ::mb.viz/date-separator "/"})))
      (is (= "M.D.YYYY, H:MM AM/PM" (format-string {::mb.viz/date-style "M/D/YYYY", ::mb.viz/date-separator "."})))
      (is (= "M-D-YYYY, H:MM AM/PM" (format-string {::mb.viz/date-style "M/D/YYYY", ::mb.viz/date-separator "-"}))))

    (testing "date-abbreviate"
      (is (= "MMM D, YYYY, H:MM AM/PM"        (format-string {::mb.viz/date-abbreviate true})))
      (is (= "MMMM D, YYYY, H:MM AM/PM"       (format-string {::mb.viz/date-abbreviate false})))
      (is (= "ddd, MMM D, YYYY, H:MM AM/PM"   (format-string {::mb.viz/date-abbreviate true
                                                              ::mb.viz/date-style, "dddd, MMMM D, YYYY"})))
      (is (= "dddd, MMMM D, YYYY, H:MM AM/PM" (format-string {::mb.viz/date-abbreviate false
                                                              ::mb.viz/date-style, "dddd, MMMM D, YYYY"}))))

    (testing "time-style"
      (is (= "MMMM D, YYYY, HH:MM"      (format-string {::mb.viz/time-style "HH:mm"})))
      (is (= "MMMM D, YYYY, H:MM AM/PM" (format-string {::mb.viz/time-style "h:mm A"})))
      (is (= "MMMM D, YYYY, H AM/PM"    (format-string {::mb.viz/time-style "h A"}))))

    (testing "time-enabled"
      (is (= "MMMM D, YYYY"                    (format-string {::mb.viz/time-enabled nil})))
      (is (= "MMMM D, YYYY, H:MM AM/PM"        (format-string {::mb.viz/time-enabled "minutes"})))
      (is (= "MMMM D, YYYY, H:MM:SS AM/PM"     (format-string {::mb.viz/time-enabled "seconds"})))
      (is (= "MMMM D, YYYY, H:MM:SS.000 AM/PM" (format-string {::mb.viz/time-enabled "milliseconds"})))
      ;; time-enabled overrides time-styled
      (is (= "MMMM D, YYYY"                    (format-string {::mb.viz/time-style "h:mm A", ::mb.viz/time-enabled nil}))))

    (testing "misc combinations"
      (is (= "YYYY.M.D, H:MM:SS AM/PM"          (format-string {::mb.viz/date-style "YYYY/M/D",
                                                                ::mb.viz/date-separator ".",
                                                                ::mb.viz/time-style "h:mm A",
                                                                ::mb.viz/time-enabled "seconds"})))
      (is (= "dddd, MMMM D, YYYY, HH:MM:SS.000" (format-string {::mb.viz/date-style "dddd, MMMM D, YYYY",
                                                                ::mb.viz/time-style "HH:mm",
                                                                ::mb.viz/time-enabled "milliseconds"}))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               XLSX export tests                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- test-xlsx-export
  [ordered-cols viz-settings rows parse-fn]
  (with-open [bos (ByteArrayOutputStream.)
              os  (BufferedOutputStream. bos)]
    (let [results-writer (i/streaming-results-writer :xlsx os)]
      (i/begin! results-writer {:data {:ordered-cols ordered-cols}} viz-settings)
      (doall (map-indexed
              (fn [i row] (i/write-row! results-writer row i ordered-cols viz-settings))
              rows))
      (i/finish! results-writer {}))
    (.flush os)
    (let [bytea (.toByteArray bos)]
      (with-open [is (BufferedInputStream. (ByteArrayInputStream. bytea))]
        (parse-fn is)))))

(defn- parse-xlsx-result
  [^BufferedInputStream is]
  (let [workbook (spreadsheet/load-workbook-from-stream is)
        sheet    (spreadsheet/select-sheet "Query result" workbook)]
    (for [row (spreadsheet/into-seq sheet)]
      (map spreadsheet/read-cell row))))

(deftest column-order-test
  (testing "Column titles are ordered correctly in the output"
    (is (= ["Col1" "Col2"]
           (test-xlsx-export [{:id 0, :name "Col1"} {:id 1, :name "Col2"}] {}  [] #(first (parse-xlsx-result %)))))
    (is (= ["Col2" "Col1"]
           (test-xlsx-export [{:id 0, :name "Col2"} {:id 1, :name "Col1"}] {}  [] #(first (parse-xlsx-result %))))))

  (testing "Data in each row is reordered by output-order prior to export"
    (is (= [["b" "a"] ["d" "c"]]
           (test-xlsx-export [{:id 0, :name "Col1"} {:id 1, :name "Col2"}]
                             {:output-order [1 0]}
                             [["a" "b"] ["c" "d"]]
                             #(rest (parse-xlsx-result %))))))

  (testing "Rows not included by index in output-order are excluded from export"
    (is (= [["b"] ["d"]]
           (test-xlsx-export [{:id 0, :name "Col1"} {:id 1, :name "Col2"}]
                             {:output-order [1]}
                             [["a" "b"] ["c" "d"]]
                             #(rest (parse-xlsx-result %)))))))
(deftest column-title-test
  (testing "::mb.viz/column-title precedence over :display_name, which takes precendence over :name"
    (is (= ["Display name"]
           (test-xlsx-export [{:id 0, :display_name "Display name", :name "Name"}] {}  [] #(first (parse-xlsx-result %)))))
    (is (= ["Column title"]
           (test-xlsx-export [{:id 0, :display_name "Display name", :name "Name"}]
                             {::mb.viz/column-settings {{::mb.viz/field-id 0} {::mb.viz/column-title "Column title"}}}
                             []
                             #(first (parse-xlsx-result %))))))

  (testing "Currency is included in column title if necessary"
    ;; Dollar symbol is included by default if semantic type of column derives from :type/Currency
    (is (= ["Col ($)"]
           (test-xlsx-export [{:id 0, :name "Col", :semantic_type :type/Cost}]
                             {::mb.viz/column-settings {::mb.viz/field-id 0}}
                             []
                             #(first (parse-xlsx-result %)))))
    ;; Currency code is used if requested in viz settings
    (is (= ["Col (USD)"]
           (test-xlsx-export [{:id 0, :name "Col", :semantic_type :type/Cost}]
                             {::mb.viz/column-settings {{::mb.viz/field-id 0}
                                                        {::mb.viz/currency "USD",
                                                         ::mb.viz/currency-style "code"}}}
                             []
                             #(first (parse-xlsx-result %)))))
    ;; Currency name is used if requested in viz settings
    (is (= ["Col (US dollars)"]
           (test-xlsx-export [{:id 0, :name "Col", :semantic_type :type/Cost}]
                             {::mb.viz/column-settings {{::mb.viz/field-id 0}
                                                        {::mb.viz/currency "USD",
                                                         ::mb.viz/currency-style "name"}}}
                             []
                             #(first (parse-xlsx-result %)))))
    ;; Currency type from viz settings is respected
    (is (= ["Col (€)"]
           (test-xlsx-export [{:id 0, :name "Col", :semantic_type :type/Cost}]
                             {::mb.viz/column-settings {{::mb.viz/field-id 0} {::mb.viz/currency "EUR"}}}
                             []
                             #(first (parse-xlsx-result %)))))
    ;; Falls back to code if native symbol is not supported
    (is (= ["Col (KGS)"]
           (test-xlsx-export [{:id 0, :name "Col", :semantic_type :type/Cost}]
                             {::mb.viz/column-settings {{::mb.viz/field-id 0}
                                                        {::mb.viz/currency "KGS", ::mb.viz/currency-style "symbol"}}}
                             []
                             #(first (parse-xlsx-result %)))))
    ;; Currency not included unless semantic type of column derives from :type/Currency
    (is (= ["Col"]
           (test-xlsx-export [{:id 0, :name "Col"}]
                             {::mb.viz/column-settings {{::mb.viz/field-id 0} {::mb.viz/currency "USD"}}}
                             []
                             #(first (parse-xlsx-result %)))))
    ;; Currency not included if ::mb.viz/currency-in-header is false
    (is (= ["Col"]
           (test-xlsx-export [{:id 0, :name "Col", :semantic_type :type/Cost}]
                             {::mb.viz/column-settings {{::mb.viz/field-id 0}
                                                        {::mb.viz/currency "USD",
                                                         ::mb.viz/currency-style "code",
                                                         ::mb.viz/currency-in-header false}}}
                             []
                             #(first (parse-xlsx-result %)))))))

(deftest scale-test
  (testing "scale is applied to data prior to export"
    (is (= [2.0]
           (test-xlsx-export [{:id 0, :name "Col"}]
                             {::mb.viz/column-settings {{::mb.viz/field-id 0} {::mb.viz/scale 2}}}
                             [[1.0]]
                             #(second (parse-xlsx-result %)))))))

(defrecord ^:private SampleNastyClass [^String v])

(generate/add-encoder
 SampleNastyClass
 (fn [obj, ^JsonGenerator json-generator]
   (.writeString json-generator (str (:v obj)))))

(defrecord ^:private AnotherNastyClass [^String v])

(deftest encode-strange-classes-test
  (testing (str "Make sure that we're piggybacking off of the JSON encoding logic when encoding strange values in "
                "XLSX (#5145, #5220, #5459)")
    (is (= ["Hello XLSX World!" "{:v \"No Encoder\"}"]
           (test-xlsx-export [{:name "val1"} {:name "val2"}]
                             {}
                             [[(SampleNastyClass. "Hello XLSX World!") (AnotherNastyClass. "No Encoder")]]
                             #(second (parse-xlsx-result %)))))))

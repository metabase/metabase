(ns metabase.query-processor.streaming.xlsx-test
  (:require
   [cheshire.generate :as json.generate]
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [dk.ative.docjure.spreadsheet :as spreadsheet]
   [metabase.driver :as driver]
   [metabase.query-processor.streaming.interface :as qp.si]
   [metabase.query-processor.streaming.xlsx :as qp.xlsx]
   [metabase.shared.models.visualization-settings :as mb.viz]
   [metabase.test :as mt])
  (:import
   (com.fasterxml.jackson.core JsonGenerator)
   (java.io BufferedInputStream BufferedOutputStream ByteArrayInputStream ByteArrayOutputStream)))

(set! *warn-on-reflection* true)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                     Format string generation unit tests                                        |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- format-string
  ([format-settings]
   (format-string format-settings nil))

  ([format-settings col]
   (let [format-strings (@#'qp.xlsx/format-settings->format-strings format-settings col)]
     ;; If only one format string is returned (for datetimes) or both format strings
     ;; are equal, just return a single value to make tests more readable.
     (cond
       (= (count format-strings) 1)
       (first format-strings)

       (= (first format-strings) (second format-strings))
       (first format-strings)

       :else
       format-strings))))

(deftest format-settings->format-string-test
  (mt/with-temporary-setting-values [custom-formatting {}]
    (testing "Empty format settings don't produce a format string"
      (is (nil? (format-string {}))))

    (testing "General number formatting"
      (testing "number-style (non-currency)"
        (is (= ["#,##0" "#,##0.##"] (format-string {::mb.viz/number-style "decimal"})))
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
                                           ::mb.viz/number-style "currency"})))

        ;; Thousands separator can be omitted
        (is (= ["###0" "###0.##"]   (format-string {::mb.viz/number-separators "."})))
        ;; Custom separators are not supported
        (is (= ["#,##0" "#,##0.##"] (format-string {::mb.viz/number-separators ", "})))
        (is (= ["#,##0" "#,##0.##"] (format-string {::mb.viz/number-separators ".,"})))
        (is (= ["#,##0" "#,##0.##"] (format-string {::mb.viz/number-separators ".’"}))))

      (testing "Scale"
        ;; Scale should not affect format string since it is applied to the actual data prior to export
        (is (= ["#,##0" "#,##0.##"] (format-string {::mb.viz/scale 2})))
        (is (= "#,##0.00"           (format-string {::mb.viz/scale 2, ::mb.viz/decimals 2}))))

      (testing "Prefix and suffix"
        ;; Prefix/suffix on general number format
        (is (= ["\"prefix\"#,##0"
                "\"prefix\"#,##0.##"]             (format-string {::mb.viz/prefix "prefix"})))
        (is (= ["#,##0\"suffix\""
                "#,##0.##\"suffix\""]             (format-string {::mb.viz/suffix "suffix"})))
        (is (= ["\"prefix\"#,##0\"suffix\""
                "\"prefix\"#,##0.##\"suffix\""]   (format-string {::mb.viz/prefix "prefix",
                                                                  ::mb.viz/suffix "suffix"})))
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
      (let [price-col {:semantic_type :type/Price, :effective_type :type/Float}]
        (testing "Default currency formatting is dollar sign"
          (is (= "[$$]#,##0.00" (format-string {::mb.viz/currency-in-header false} price-col))))

        (testing "Uses native currency symbol if supported"
          (is (= "[$$]#,##0.00"   (format-string {::mb.viz/currency-in-header false, ::mb.viz/currency "USD"} price-col)))
          (is (= "[$CA$]#,##0.00" (format-string {::mb.viz/currency-in-header false, ::mb.viz/currency "CAD"} price-col)))
          (is (= "[$€]#,##0.00"   (format-string {::mb.viz/currency-in-header false, ::mb.viz/currency "EUR"} price-col)))
          (is (= "[$¥]#,##0.00"   (format-string {::mb.viz/currency-in-header false, ::mb.viz/currency "JPY"} price-col))))

        (testing "Falls back to code if native symbol not supported"
          (is (= "[$KGS] #,##0.00" (format-string {::mb.viz/currency-in-header false, ::mb.viz/currency "KGS"} price-col)))
          (is (= "[$KGS] #,##0.00" (format-string {::mb.viz/currency-in-header false,
                                                   ::mb.viz/currency "KGS",
                                                   ::mb.viz/currency-style "symbol"}
                                                  price-col))))

        (testing "Respects currency-style option"
          (is (= "[$$]#,##0.00"            (format-string {::mb.viz/currency-in-header false,
                                                           ::mb.viz/currency-style "symbol"}
                                                          price-col)))
          (is (= "[$USD] #,##0.00"         (format-string {::mb.viz/currency-in-header false,
                                                           ::mb.viz/currency-style "code"}
                                                          price-col)))
          (is (= "#,##0.00\" US dollars\"" (format-string {::mb.viz/currency-in-header false,
                                                           ::mb.viz/currency-style "name"}
                                                          price-col)))
          (is (= "[$€]#,##0.00"            (format-string {::mb.viz/currency-in-header false,
                                                           ::mb.viz/currency "EUR",
                                                           ::mb.viz/currency-style "symbol"}
                                                          price-col)))
          (is (= "[$EUR] #,##0.00"         (format-string {::mb.viz/currency-in-header false,
                                                           ::mb.viz/currency "EUR",
                                                           ::mb.viz/currency-style "code"}
                                                          price-col)))
          (is (= "#,##0.00\" euros\""      (format-string {::mb.viz/currency-in-header false,
                                                           ::mb.viz/currency "EUR",
                                                           ::mb.viz/currency-style "name"}
                                                          price-col))))

        (testing "Currency not included for non-currency semantic types"
          (is (= "#,##0.00" (format-string {::mb.viz/currency-in-header false} {:semantic_type :type/Quantity}))))

        (testing "Formatting options are ignored if currency-in-header is true or absent (defaults to true)"
          (is (= "#,##0.00" (format-string {::mb.viz/currency-style "symbol"} price-col)))
          (is (= "#,##0.00" (format-string {::mb.viz/currency-style "name"} price-col)))
          (is (= "#,##0.00" (format-string {::mb.viz/currency-style "code"} price-col)))
          (is (= "#,##0.00" (format-string {::mb.viz/currency "USD"} price-col)))
          (is (= "#,##0.00" (format-string {::mb.viz/currency "EUR"} price-col)))
          (is (= "#,##0.00" (format-string {::currency-in-header true, ::mb.viz/currency-style "symbol"} price-col)))
          (is (= "#,##0.00" (format-string {::currency-in-header true, ::mb.viz/currency-style "name"} price-col)))
          (is (= "#,##0.00" (format-string {::currency-in-header true, ::mb.viz/currency-style "code"} price-col)))
          (is (= "#,##0.00" (format-string {::currency-in-header true, ::mb.viz/currency "USD"} price-col)))
          (is (= "#,##0.00" (format-string {::currency-in-header true, ::mb.viz/currency "EUR"} price-col))))

        (testing "Global localization settings are incorporated with lower precedence than column format settings"
          (mt/with-temporary-setting-values [custom-formatting {:type/Currency {:currency "EUR",
                                                                                :currency_in_header false,
                                                                                :currency_style "code"}}]
            (is (= "[$EUR] #,##0.00" (format-string {} price-col)))
            (is (= "[$CAD] #,##0.00" (format-string {::mb.viz/currency "CAD"} price-col)))
            (is (= "[$€]#,##0.00"    (format-string {::mb.viz/currency-style "symbol"} price-col)))
            (is (= "#,##0.00"        (format-string {::mb.viz/currency-in-header true} price-col)))))))

    (testing "Datetime formatting"
      (let [date-col {:semantic_type :type/CreationTimestamp, :effective_type :type/Temporal}]
        (testing "date-style"
          (is (= "m/d/yyyy, h:mm am/pm"           (format-string {::mb.viz/date-style "M/D/YYYY"} date-col)))
          (is (= "d/m/yyyy, h:mm am/pm"           (format-string {::mb.viz/date-style "D/M/YYYY"} date-col)))
          (is (= "yyyy/m/d, h:mm am/pm"           (format-string {::mb.viz/date-style "YYYY/M/D"} date-col)))
          (is (= "mmmm d, yyyy, h:mm am/pm"       (format-string {::mb.viz/date-style "MMMM D, YYYY"} date-col)))
          (is (= "dmmmm, yyyy, h:mm am/pm"        (format-string {::mb.viz/date-style "DMMMM, YYYY"} date-col)))
          (is (= "dddd, mmmm d, yyyy, h:mm am/pm" (format-string {::mb.viz/date-style "dddd, MMMM D, YYYY"} date-col))))

        (testing "date-separator"
          (is (= "m/d/yyyy, h:mm am/pm" (format-string {::mb.viz/date-style "M/D/YYYY", ::mb.viz/date-separator "/"} date-col)))
          (is (= "m.d.yyyy, h:mm am/pm" (format-string {::mb.viz/date-style "M/D/YYYY", ::mb.viz/date-separator "."} date-col)))
          (is (= "m-d-yyyy, h:mm am/pm" (format-string {::mb.viz/date-style "M/D/YYYY", ::mb.viz/date-separator "-"} date-col))))

        (testing "date-abbreviate"
          (is (= "mmm d, yyyy, h:mm am/pm"        (format-string {::mb.viz/date-abbreviate true} date-col)))
          (is (= "mmmm d, yyyy, h:mm am/pm"       (format-string {::mb.viz/date-abbreviate false} date-col)))
          (is (= "ddd, mmm d, yyyy, h:mm am/pm"   (format-string {::mb.viz/date-abbreviate true
                                                                  ::mb.viz/date-style, "dddd, MMMM D, YYYY"} date-col)))
          (is (= "dddd, mmmm d, yyyy, h:mm am/pm" (format-string {::mb.viz/date-abbreviate false
                                                                  ::mb.viz/date-style, "dddd, MMMM D, YYYY"} date-col))))

        (testing "time-style"
          (is (= "mmmm d, yyyy, hh:mm"      (format-string {::mb.viz/time-style "HH:mm"} date-col)))
          (is (= "mmmm d, yyyy, hh:mm"      (format-string {::mb.viz/time-style "k:mm"} date-col)))
          (is (= "mmmm d, yyyy, h:mm am/pm" (format-string {::mb.viz/time-style "h:mm A"} date-col)))
          (is (= "mmmm d, yyyy, h am/pm"    (format-string {::mb.viz/time-style "h A"} date-col))))

        (testing "time-enabled"
          (is (= "mmmm d, yyyy"                    (format-string {::mb.viz/time-enabled nil} date-col)))
          (is (= "mmmm d, yyyy, h:mm am/pm"        (format-string {::mb.viz/time-enabled "minutes"} date-col)))
          (is (= "mmmm d, yyyy, h:mm:ss am/pm"     (format-string {::mb.viz/time-enabled "seconds"} date-col)))
          (is (= "mmmm d, yyyy, h:mm:ss.000 am/pm" (format-string {::mb.viz/time-enabled "milliseconds"} date-col)))
          ;; time-enabled overrides time-styled
          (is (= "mmmm d, yyyy"                    (format-string {::mb.viz/time-style "h:mm A", ::mb.viz/time-enabled nil} date-col))))

        (testing ":unit values on temporal breakout fields"
          (let [month-col (assoc date-col :unit :month)
                year-col  (assoc date-col :unit :year)]
            (is (= "mmmm, yyyy" (format-string {} month-col)))
            (is (= "m/yyyy"     (format-string {::mb.viz/date-style "M/D/YYYY"} month-col)))
            (is (= "yyyy/m"     (format-string {::mb.viz/date-style "YYYY/M/D"} month-col)))
            (is (= "mmmm, yyyy" (format-string {::mb.viz/date-style "MMMM D, YYYY"} month-col)))
            (is (= "mmmm, yyyy" (format-string {::mb.viz/date-style "D MMMM, YYYY"} month-col)))
            (is (= "mmmm, yyyy" (format-string {::mb.viz/date-style "DDDD, MMMM D, YYYY"} month-col)))
            (is (= "yyyy"       (format-string {} year-col)))
            (is (= "yyyy"       (format-string {::mb.viz/date-style "M/D/YYYY"} year-col)))))

        (testing "misc combinations"
          (is (= "yyyy.m.d, h:mm:ss am/pm"          (format-string {::mb.viz/date-style "YYYY/M/D",
                                                                    ::mb.viz/date-separator ".",
                                                                    ::mb.viz/time-style "h:mm A",
                                                                    ::mb.viz/time-enabled "seconds"} date-col)))
          (is (= "dddd, mmmm d, yyyy, hh:mm:ss.000" (format-string {::mb.viz/date-style "dddd, MMMM D, YYYY",
                                                                    ::mb.viz/time-style "HH:mm",
                                                                    ::mb.viz/time-enabled "milliseconds"} date-col))))

        (testing "Global localization settings are incorporated with lower precedence than column format settings"
          (mt/with-temporary-setting-values [custom-formatting {:type/Temporal {:date_style "YYYY/M/D",
                                                                                :date_separator ".",
                                                                                :time_style "HH:mm"}}]
            (is (= "yyyy.m.d, hh:mm"      (format-string {} date-col)))
            (is (= "d.m.yyyy, hh:mm"      (format-string {::mb.viz/date-style "D/M/YYYY"} date-col)))
            (is (= "yyyy-m-d, hh:mm"      (format-string {::mb.viz/date-separator "-"} date-col)))
            (is (= "yyyy.m.d, h:mm am/pm" (format-string {::mb.viz/time-style "h:mm A"} date-col)))))))

    (testing "primary key and foreign key formatting"
      (is (= "0" (format-string {} {:semantic_type :type/PK})))
      (is (= "0" (format-string {} {:semantic_type :type/FK}))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               XLSX export tests                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

;; These are tests that generate an XLSX binary and then parse and assert on its contents, to test logic and value
;; formatting that is specific to the XLSX format. These do NOT test any of the column ordering logic in
;; `metabase.query-processor.streaming`, or anything that happens in the API handlers for generating exports.

(defn parse-cell-content
  "Parses an XLSX sheet and returns the raw data in each row"
  [sheet]
  (mapv (fn [row]
          (mapv spreadsheet/read-cell row))
        (spreadsheet/into-seq sheet)))

(defn parse-xlsx-results
  "Given a byte array representing an XLSX document, parses the query result sheet using the provided `parse-fn`"
  ([bytea]
   (parse-xlsx-results bytea parse-cell-content))

  ([bytea parse-fn]
   (with-open [is (BufferedInputStream. (ByteArrayInputStream. bytea))]
     (let [workbook (spreadsheet/load-workbook-from-stream is)
           sheet    (spreadsheet/select-sheet "Query result" workbook)]
       (parse-fn sheet)))))

(defn- xlsx-export
  ([ordered-cols viz-settings rows]
   (xlsx-export ordered-cols viz-settings rows parse-cell-content))

  ([ordered-cols viz-settings rows parse-fn]
   (with-open [bos (ByteArrayOutputStream.)
               os  (BufferedOutputStream. bos)]
     (let [results-writer (qp.si/streaming-results-writer :xlsx os)]
       (qp.si/begin! results-writer {:data {:ordered-cols ordered-cols}} viz-settings)
       (doall (map-indexed
               (fn [i row] (qp.si/write-row! results-writer row i ordered-cols viz-settings))
               rows))
       (qp.si/finish! results-writer {:row_count (count rows)}))
     (let [bytea (.toByteArray bos)]
       (parse-xlsx-results bytea parse-fn)))))

(defn- parse-format-strings
  [sheet]
  (for [^org.apache.poi.ss.usermodel.Row row (spreadsheet/into-seq sheet)]
    (map (fn [^org.apache.poi.xssf.usermodel.XSSFCell cell]
           (.. cell getCellStyle getDataFormatString))
         row)))

(deftest export-format-test
  (testing "Different format strings are used for ints and numbers that round to ints (with 2 decimal places)"
    (is (= [["#,##0"] ["#,##0.##"] ["#,##0"] ["#,##0.##"] ["#,##0"] ["#,##0.##"]]
           (rest (xlsx-export [{:id 0, :name "Col", :semantic_type :type/Cost}]
                              {}
                              [[1] [1.23] [1.004] [1.005] [10000000000] [10000000000.123]]
                              parse-format-strings)))))

  (testing "Misc format strings are included correctly in exports"
    (is (= ["[$€]#,##0.00"]
           (second (xlsx-export [{:id 0, :name "Col", :semantic_type :type/Cost}]
                                {::mb.viz/column-settings {{::mb.viz/field-id 0}
                                                           {::mb.viz/currency "EUR"
                                                            ::mb.viz/currency-in-header false}}}
                                [[1.23]]
                                parse-format-strings))))
    (is (= ["yyyy.m.d, h:mm:ss am/pm"]
           (second (xlsx-export [{:id 0, :name "Col", :effective_type :type/Temporal}]
                                {::mb.viz/column-settings {{::mb.viz/field-id 0}
                                                           {::mb.viz/date-style "YYYY/M/D",
                                                            ::mb.viz/date-separator ".",
                                                            ::mb.viz/time-style "h:mm A",
                                                            ::mb.viz/time-enabled "seconds"}}}
                                [[#t "2020-03-28T10:12:06.681"]]
                                parse-format-strings))))))

(deftest column-order-test
  (testing "Column titles are ordered correctly in the output"
    (is (= ["Col1" "Col2"]
           (first (xlsx-export [{:id 0, :name "Col1"} {:id 1, :name "Col2"}] {} []))))
    (is (= ["Col2" "Col1"]
           (first (xlsx-export [{:id 0, :name "Col2"} {:id 1, :name "Col1"}] {} [])))))

  (testing "Data in each row is reordered by output-order prior to export"
    (is (= [["b" "a"] ["d" "c"]]
           (rest (xlsx-export [{:id 0, :name "Col1"} {:id 1, :name "Col2"}]
                              {:output-order [1 0]}
                              [["a" "b"] ["c" "d"]])))))

  (testing "Rows not included by index in output-order are excluded from export"
    (is (= [["b"] ["d"]]
           (rest (xlsx-export [{:id 0, :name "Col1"} {:id 1, :name "Col2"}]
                              {:output-order [1]}
                              [["a" "b"] ["c" "d"]]))))))

(deftest column-title-test
  (testing "::mb.viz/column-title precedence over :display_name, which takes precendence over :name"
    (is (= ["Display name"]
           (first (xlsx-export [{:id 0, :display_name "Display name", :name "Name"}] {} []))))
    (is (= ["Column title"]
           (first (xlsx-export [{:id 0, :display_name "Display name", :name "Name"}]
                               {::mb.viz/column-settings {{::mb.viz/field-id 0} {::mb.viz/column-title "Column title"}}}
                               []))))
    ;; Columns can be correlated to viz settings by :name if :id is missing (e.g. for native queries)
    (is (= ["Column title"]
           (first (xlsx-export [{:display_name "Display name", :name "Name"}]
                               {::mb.viz/column-settings {{::mb.viz/column-name "Name"} {::mb.viz/column-title "Column title"}}}
                               [])))))

  (testing "Currency is included in column title if necessary"
    ;; Dollar symbol is included by default if semantic type of column derives from :type/Currency
    (is (= ["Col ($)"]
           (first (xlsx-export [{:id 0, :name "Col", :semantic_type :type/Cost}]
                               {::mb.viz/column-settings {::mb.viz/field-id 0}}
                               []))))
    ;; Currency code is used if requested in viz settings
    (is (= ["Col (USD)"]
           (first (xlsx-export [{:id 0, :name "Col", :semantic_type :type/Cost}]
                               {::mb.viz/column-settings {{::mb.viz/field-id 0}
                                                          {::mb.viz/currency "USD",
                                                           ::mb.viz/currency-style "code"}}}
                               []))))
    ;; Currency name is used if requested in viz settings
    (is (= ["Col (US dollars)"]
           (first (xlsx-export [{:id 0, :name "Col", :semantic_type :type/Cost}]
                               {::mb.viz/column-settings {{::mb.viz/field-id 0}
                                                          {::mb.viz/currency "USD",
                                                           ::mb.viz/currency-style "name"}}}
                               []))))
    ;; Currency type from viz settings is respected
    (is (= ["Col (€)"]
           (first (xlsx-export [{:id 0, :name "Col", :semantic_type :type/Cost}]
                               {::mb.viz/column-settings {{::mb.viz/field-id 0} {::mb.viz/currency "EUR"}}}
                               []))))
    ;; Falls back to code if native symbol is not supported
    (is (= ["Col (KGS)"]
           (first (xlsx-export [{:id 0, :name "Col", :semantic_type :type/Cost}]
                               {::mb.viz/column-settings {{::mb.viz/field-id 0}
                                                          {::mb.viz/currency "KGS", ::mb.viz/currency-style "symbol"}}}
                               []))))
    ;; Currency not included unless semantic type of column derives from :type/Currency
    (is (= ["Col"]
           (first (xlsx-export [{:id 0, :name "Col"}]
                               {::mb.viz/column-settings {{::mb.viz/field-id 0} {::mb.viz/currency "USD"}}}
                               []))))
    ;; Currency not included if ::mb.viz/currency-in-header is false
    (is (= ["Col"]
           (first (xlsx-export [{:id 0, :name "Col", :semantic_type :type/Cost}]
                               {::mb.viz/column-settings {{::mb.viz/field-id 0}
                                                          {::mb.viz/currency "USD",
                                                           ::mb.viz/currency-style "code",
                                                           ::mb.viz/currency-in-header false}}}
                               [])))))

  (testing "If a col is remapped to a foreign key field, the title is taken from the viz settings for its fk_field_id (#18573)"
    (is (= ["Correct title"]
           (first (xlsx-export [{:id 0, :fk_field_id 1, :remapped_from "FIELD_1"}]
                               {::mb.viz/column-settings {{::mb.viz/field-id 0} {::mb.viz/column-title "Incorrect title"}
                                                          {::mb.viz/field-id 1} {::mb.viz/column-title "Correct title"}}}
                               []))))))

(deftest scale-test
  (testing "scale is applied to data prior to export"
    (is (= [2.0]
           (second (xlsx-export [{:id 0, :name "Col"}]
                                {::mb.viz/column-settings {{::mb.viz/field-id 0} {::mb.viz/scale 2}}}
                                [[1.0]]))))))

(deftest misc-data-test
  (testing "nil values"
    (is (= [nil]
           (second (xlsx-export [{:id 0, :name "Col"}] {} [[nil]])))))
  (testing "Boolean values"
    (is (= [[true] [false]]
           (rest (xlsx-export [{:id 0, :name "Col"}] {} [[true] [false]])))))
  (testing "ints"
    (is (= [1.0]
           (second (xlsx-export [{:id 0, :name "Col"}] {} [[1]])))))
  (testing "bigints"
    (is (= [1.0]
           (second (xlsx-export [{:id 0, :name "Col"}] {} [[1N]])))))
  (testing "bigdecimals"
    (is (= [1.23]
           (second (xlsx-export [{:id 0, :name "Col"}] {} [[1.23M]])))))
  (testing "numbers that round to ints"
    (is (= [2.00001]
           (second (xlsx-export [{:id 0, :name "Col"}] {} [[2.00001]])))))
  (testing "numbers that do not round to ints"
    (is (= [123.123]
           (second (xlsx-export [{:id 0, :name "Col"}] {} [[123.123]])))))
  (testing "LocalDate"
    (is (= [#inst "2020-03-28T00:00:00.000-00:00"]
           (second (xlsx-export [{:id 0, :name "Col"}] {} [[#t "2020-03-28"]])))))
  (testing "LocalDateTime"
    (is (= [#inst "2020-03-28T10:12:06.681-00:00"]
           (second (xlsx-export [{:id 0, :name "Col"}] {} [[#t "2020-03-28T10:12:06.681"]])))))
  (testing "LocalTime"
    (is (= [#inst "1899-12-31T10:12:06.000-00:00"]
           (second (xlsx-export [{:id 0, :name "Col"}] {} [[#t "10:12:06.681"]])))))
  (testing "LocalDateTime formatted as a string; should be parsed when *parse-temporal-string-values* is true"
    (is (= ["2020-03-28T10:12:06.681"]
           (second (xlsx-export [{:id 0, :name "Col"}] {} [["2020-03-28T10:12:06.681"]]))))
    (binding [qp.xlsx/*parse-temporal-string-values* true]
      (is (= [#inst "2020-03-28T10:12:06.681"]
             (second (xlsx-export [{:id 0, :name "Col"}] {} [["2020-03-28T10:12:06.681"]]))))))
  (mt/with-everything-store
    (binding [driver/*driver* :h2]
      (testing "OffsetDateTime"
        (is (= [#inst "2020-03-28T13:33:06.000-00:00"]
               (second (xlsx-export [{:id 0, :name "Col"}] {} [[#t "2020-03-28T10:12:06Z-03:21"]])))))
      (testing "OffsetTime"
        (is (= [#inst "1899-12-31T10:12:06.000-00:00"]
               (second (xlsx-export [{:id 0, :name "Col"}] {} [[#t "10:12:06Z-03:21"]])))))
      (testing "ZonedDateTime"
        (is (= [#inst "2020-03-28T10:12:06.000-00:00"]
               (second (xlsx-export [{:id 0, :name "Col"}] {} [[#t "2020-03-28T10:12:06Z"]])))))))
  (testing "Strings representing country names/codes don't error when *parse-temporal-string-values* is true (#18724)"
    (binding [qp.xlsx/*parse-temporal-string-values* true]
      (is (= ["GB"]
             (second (xlsx-export [{:id 0, :name "Col"}] {} [["GB"]]))))
      (is (= ["Portugal"]
             (second (xlsx-export [{:id 0, :name "Col"}] {} [["Portugal"]]))))))
  (testing "NaN and infinity values (#21343)"
    ;; These values apparently are represented as error codes, which are parsed here into keywords
    (is (= [:NUM]
           (second (xlsx-export [{:id 0, :name "Col"}] {} [[##NaN]]))))
    (is (= [:DIV0]
           (second (xlsx-export [{:id 0, :name "Col"}] {} [[##Inf]]))))
    (is (= [:DIV0]
           (second (xlsx-export [{:id 0, :name "Col"}] {} [[##-Inf]]))))))

(defrecord ^:private SampleNastyClass [^String v])

(json.generate/add-encoder
 SampleNastyClass
 (fn [obj, ^JsonGenerator json-generator]
   (.writeString json-generator (str (:v obj)))))

(defrecord ^:private AnotherNastyClass [^String v])

(deftest encode-strange-classes-test
  (testing (str "Make sure that we're piggybacking off of the JSON encoding logic when encoding strange values in "
                "XLSX (#5145, #5220, #5459)")
    (is (= ["Hello XLSX World!" "{:v \"No Encoder\"}"]
           (second (xlsx-export [{:name "val1"} {:name "val2"}]
                                {}
                                [[(SampleNastyClass. "Hello XLSX World!") (AnotherNastyClass. "No Encoder")]]))))))

(defn- parse-column-width
  [^org.apache.poi.ss.usermodel.Sheet sheet]
  (for [^org.apache.poi.ss.usermodel.Row row (spreadsheet/into-seq sheet)]
    (for [i (range (.getLastCellNum row))]
      (.getColumnWidth sheet i))))

(deftest auto-sizing-test
  (testing "Columns in export are autosized to fit their content"
    (let [[col1-width col2-width] (second (xlsx-export [{:id 0, :name "Col1"} {:id 1, :name "Col2"}]
                                                       {}
                                                       [["a" "abcdefghijklmnopqrstuvwxyz"]]
                                                       parse-column-width))]
      ;; Provide a marign for error since width measurements end up being slightly different on CI
      (is (<= 2300 col1-width 2400))
      (is (<= 7950 col2-width 8200))))
  (testing "Auto-sizing works when the number of rows is at or above the auto-sizing threshold"
    (binding [qp.xlsx/*auto-sizing-threshold* 2]
      (let [[col-width] (second (xlsx-export [{:id 0, :name "Col1"}]
                                             {}
                                             [["abcdef"] ["abcedf"]]
                                             parse-column-width))]
        (is (<= 2800 col-width 2900)))
      (let [[col-width] (second (xlsx-export [{:id 0, :name "Col1"}]
                                             {}
                                             [["abcdef"] ["abcedf"] ["abcdef"]]
                                             parse-column-width))]
        (is (<= 2800 col-width 2900)))))
  (testing "An auto-sized column does not exceed max-column-width (the width of 255 characters)"
    (let [[col-width] (second (xlsx-export [{:id 0, :name "Col1"}]
                                           {}
                                           [[(apply str (repeat 256 "0"))]]
                                           parse-column-width))]
      (is (= 65280 col-width)))))

(deftest poi-tempfiles-test
  (testing "POI temporary files are cleaned up if output stream is closed before export completes (#19480)"
    (let [poifiles-directory      (io/file (str (System/getProperty "java.io.tmpdir") "/poifiles"))
          expected-poifiles-count (count (file-seq poifiles-directory))
          ;; TODO -- shouldn't these be using `with-open`?!
          bos                     (ByteArrayOutputStream.)
          os                      (BufferedOutputStream. bos)
          results-writer          (qp.si/streaming-results-writer :xlsx os)]
      (.close os)
      (qp.si/begin! results-writer {:data {:ordered-cols []}} {})
      (qp.si/finish! results-writer {:row_count 0})
      ;; No additional files should exist in the temp directory
      (is (= expected-poifiles-count (count (file-seq poifiles-directory)))))))

(deftest dont-format-non-temporal-columns-as-temporal-columns-test
  (testing "Don't format columns with temporal semantic type as datetime unless they're actually datetimes (#18729)"
    (mt/dataset sample-dataset
      (is (= [["CREATED_AT"]
              [1.0]
              [2.0]]
             (xlsx-export [{:id             0
                            :semantic_type  :type/CreationTimestamp
                            :unit           :month-of-year
                            :name           "CREATED_AT"
                            :effective_type :type/Integer
                            :base_type      :type/Integer}]
                          {}
                          [[1]
                           [2]]))))))

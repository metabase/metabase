(ns ^:mb/driver-tests metabase.query-processor.streaming.ods-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.query-processor.streaming.interface :as qp.si]
   ;; defmethods for :ods
   [metabase.query-processor.streaming.ods]
   [metabase.query-processor.test :as qp]
   [metabase.test :as mt])
  (:import
   (java.io ByteArrayInputStream ByteArrayOutputStream InputStream)
   (org.odftoolkit.odfdom.doc OdfSpreadsheetDocument)
   (org.odftoolkit.odfdom.doc.table OdfTable OdfTableCell)))

(set! *warn-on-reflection* true)

(defn- ods-cell->str
  "Same semantics as the helper in `downloads-exports-test` (see that ns for `getCellByPosition` order).
  Distinguishes blank cells (no `office:value-type`) from numeric zero for pre-allocated ODF tables."
  [^OdfTableCell cell]
  (if (nil? cell)
    ""
    (let [s  (.getStringValue cell)
          vt (or (.getValueType cell) "")]
      (cond
        (not (str/blank? s)) s
        (str/blank? vt) ""
        :else
        (let [vt' (str/lower-case vt)]
          (cond
            (= "boolean" vt') (str (boolean (.getBooleanValue cell)))
            (contains? #{"float" "percentage" "currency"} vt') (str (or (.getDoubleValue cell) 0.0))
            :else s))))))

(defn- read-ods-table
  [^bytes b]
  (with-open [^InputStream in (ByteArrayInputStream. b)]
    (let [^OdfSpreadsheetDocument doc (OdfSpreadsheetDocument/loadDocument in)
          ^OdfTable table (or (.getTableByName doc "Query result")
                              (first (.getTableList doc)))]
      (when table
        (let [nrows (int (.getRowCount table))
              ncols (int (.getColumnCount table))]
          (mapv
           (fn [r]
             (mapv
              (fn [c]
                ;; OdfTable.getCellByPosition is (colIndex, rowIndex)
                (ods-cell->str
                 (.getCellByPosition table (int c) (int r))))
              (range ncols)))
           (range nrows)))))))

(deftest ^:parallel ods-stream-options-mime-and-filename-test
  (is (= "application/vnd.oasis.opendocument.spreadsheet" (:content-type (qp.si/stream-options :ods "my_card"))))
  (is (re-find #"\.ods\""
               (get-in (qp.si/stream-options :ods "my_card") [:headers "Content-Disposition"]))))

(deftest ^:parallel ods-stream-writes-smoke-test
  (testing "Round-trip a small query through the ODS streaming writer; verify table shape and a known cell"
    (let [baos (ByteArrayOutputStream.)]
      (qp.streaming/do-with-streaming-rff
       :ods baos
       (fn [rff]
         (is (=? {:status :completed}
                 (qp/process-query
                  (mt/mbql-query venues
                    {:order-by [[:asc $id]]
                     :fields   [[:field $id nil]
                                [:field $name nil]]
                     :limit    2})
                  rff)))))
      (let [rows (read-ods-table (.toByteArray baos))]
        (is (>= (count rows) 3) "expect header + 2 data rows")
        (is (str/includes? (str (get-in rows [0 0])) "ID") "first header references ID column")
        (is (not (str/blank? (str (get-in rows [1 0])))) "first id cell is present")))))

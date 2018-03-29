(ns metabase.util.export
  (:require [cheshire.core :as json]
            [clj-pdf.core :as pdf]
            [clojure.data.csv :as csv]
            [dk.ative.docjure.spreadsheet :as spreadsheet])
  (:import [java.io ByteArrayInputStream ByteArrayOutputStream File]
           org.apache.poi.ss.usermodel.Cell))

;; add a generic implementation for the method that writes values to XLSX cells that just piggybacks off the
;; implementations we've already defined for encoding things as JSON. These implementations live in
;; `metabase.middleware`.
(defmethod spreadsheet/set-cell! Object [^Cell cell, value]
  (when (= (.getCellType cell) Cell/CELL_TYPE_FORMULA)
    (.setCellType cell Cell/CELL_TYPE_STRING))
  ;; stick the object in a JSON map and encode it, which will force conversion to a string. Then unparse that JSON and
  ;; use the resulting value as the cell's new String value.  There might be some more efficient way of doing this but
  ;; I'm not sure what it is.
  (.setCellValue cell (str (-> (json/generate-string {:v value})
                               (json/parse-string keyword)
                               :v))))

(defn- results->cells
  "Convert the resultset to a seq of rows with the first row as a header"
  [results]
  (cons (map :display_name (get-in results [:result :data :cols]))
        (get-in results [:result :data :rows])))

(defn- export-to-xlsx [columns rows]
  (let [wb  (spreadsheet/create-workbook "Query result" (cons (mapv name columns) rows))
        ;; note: byte array streams don't need to be closed
        out (ByteArrayOutputStream.)]
    (spreadsheet/save-workbook! out wb)
    (ByteArrayInputStream. (.toByteArray out))))

(defn export-to-xlsx-file
  "Write an XLS file to `FILE` with the header a and rows found in `RESULTS`"
  [^File file results]
  (let [file-path (.getAbsolutePath file)]
    (->> (results->cells results)
         (spreadsheet/create-workbook "Query result" )
         (spreadsheet/save-workbook! file-path))))

(defn- export-to-csv [columns rows]
  (with-out-str
    ;; turn keywords into strings, otherwise we get colons in our output
    (csv/write-csv *out* (into [(mapv name columns)] rows))))

(defn export-to-csv-writer
  "Write a CSV to `FILE` with the header a and rows found in `RESULTS`"
  [^File file results]
  (with-open [fw (java.io.FileWriter. file)]
    (csv/write-csv fw (results->cells results))))

(defn- export-to-json [columns rows]
  (for [row rows]
    (zipmap columns row)))

(defn- pdf-table-seq
  "Helper method to write the dataset"
  [rows]
  (into
    [:pdf-table
      {:width-percent 100}
      nil
    ]
    (mapv (fn [row] (vec (map (fn [element] [:pdf-cell (str element) ]) row ) ) ) rows)
  ))

(defn- export-to-pdf
  "Write a PDF to stream with the content in rows vector of sequences"
  [columns rows]
  (let [output-stream (ByteArrayOutputStream.)]
    (pdf/pdf [{}
      ; write the title
      [:paragraph "results"]

      ; write the header row
      (into
        [:pdf-table
          {:width-percent 100
          }
          nil
        ]
        [(mapv name columns)])

      ; write the contents
      (pdf-table-seq rows)]
      output-stream)

    ; write the stream
    (ByteArrayInputStream. (.toByteArray output-stream))))


(def export-formats
  "Map of export types to their relevant metadata"
  {"csv"  {:export-fn    export-to-csv
           :content-type "text/csv"
           :ext          "csv"
           :context      :csv-download},
   "xlsx" {:export-fn    export-to-xlsx
           :content-type "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
           :ext          "xlsx"
           :context      :xlsx-download},
   "pdf"  {:export-fn    export-to-pdf
           :content-type "application/pdf"
           :ext          "pdf"
           :context      :pdf-download},
   "json" {:export-fn    export-to-json
           :content-type "applicaton/json"
           :ext          "json"
           :context      :json-download}})

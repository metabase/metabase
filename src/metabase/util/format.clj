(ns metabase.util.format
  "Functions for transforming query results into files"
  (:require [cheshire.core :as json]
            [clojure.data.csv :as csv]
            [clojure.java.io :as io]
            [dk.ative.docjure.spreadsheet :as spreadsheet]
            [schema.core :as s])
  (:import [java.io BufferedWriter ByteArrayInputStream ByteArrayOutputStream]
           org.apache.poi.ss.usermodel.Cell))

;; add a generic implementation for the method that writes values to XLSX cells that just piggybacks off the implementations
;; we've already defined for encoding things as JSON. These implementations live in `metabase.middleware`.
(defmethod spreadsheet/set-cell! Object [^Cell cell, value]
  (when (= (.getCellType cell) Cell/CELL_TYPE_FORMULA)
    (.setCellType cell Cell/CELL_TYPE_STRING))
  ;; stick the object in a JSON map and encode it, which will force conversion to a string. Then unparse that JSON and use the resulting value
  ;; as the cell's new String value.
  ;; There might be some more efficient way of doing this but I'm not sure what it is.
  (.setCellValue cell (str (-> (json/generate-string {:v value})
                               (json/parse-string keyword)
                               :v))))

(defn- export-to-xlsx [columns rows]
  (let [wb  (spreadsheet/create-workbook "Query result" (cons (mapv name columns) rows))
        ;; note: byte array streams don't need to be closed
        out (ByteArrayOutputStream.)]
    (spreadsheet/save-workbook! out wb)
    (ByteArrayInputStream. (.toByteArray out))))

(defn- export-to-csv [columns rows]
  (with-out-str
    ;; turn keywords into strings, otherwise we get colons in our output
    (csv/write-csv *out* (into [(mapv name columns)] rows))))

(defn- export-to-json [columns rows]
  (for [row rows]
    (zipmap columns row)))

(defn- str-to-stream
	[input-str out-stream]
	(.write out-stream (.getBytes input-str)))

(defn- copy-stream
	[in-stream out-stream]
  (with-open [input in-stream]
    (io/copy input out-stream)))

(defn- map-to-json-stream
	[in-map out-stream]
  (with-open [os-writer (java.io.OutputStreamWriter. out-stream)
              bw        (BufferedWriter. os-writer)]
    (json/generate-stream in-map bw)))

(def export-formats
  {"csv"  {:export-fn    export-to-csv
					 :to-stream    str-to-stream
           :content-type "text/csv"
           :ext          "csv"
           :context      :csv-download},
   "xlsx" {:export-fn    export-to-xlsx
					 :to-stream    copy-stream
           :content-type "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
           :ext          "xlsx"
           :context      :xlsx-download},
   "json" {:export-fn    export-to-json
					 :to-stream    map-to-json-stream
           :content-type "applicaton/json"
           :ext          "json"
           :context      :json-download}})

(def ExportFormat
  "Schema for valid export formats for downloading query results."
  (apply s/enum (keys export-formats)))

(defn as-format
  "Return map containing format info and the RESULTS of a query in the specified format."
  {:style/indent 1, :arglists '([export-format results])}
  [export-format {{:keys [columns rows]} :data}]
  (let [export-conf (export-formats export-format)
        body ((:export-fn export-conf) columns rows)]
    {:body         body
     :to-stream    (partial (:to-stream export-conf) body)
     :content-type (str (:content-type export-conf) "; charset=utf-8")
     :ext          (:ext export-conf)}))

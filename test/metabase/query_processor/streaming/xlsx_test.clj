(ns metabase.query-processor.streaming.xlsx-test
  (:require [cheshire.generate :as generate]
            [clojure.test :refer :all]
            [dk.ative.docjure.spreadsheet :as spreadsheet])
  (:import com.fasterxml.jackson.core.JsonGenerator))

(defrecord ^:private SampleNastyClass [^String v])

(generate/add-encoder
 SampleNastyClass
 (fn [obj, ^JsonGenerator json-generator]
   (.writeString json-generator (str (:v obj)))))

(defrecord ^:private AnotherNastyClass [^String v])

(deftest encode-strange-classes-test
  (testing (str "Make sure that we're piggybacking off of the JSON encoding logic when encoding strange values in "
                "XLSX (#5145, #5220, #5459)")
    (is (= [{"Values" "values"}
            ;; should use the JSON encoding implementation for object
            {"Values" "Hello XLSX World!"}
            ;; fall back to the implementation of `str` for an object if no JSON encoder exists rather than barfing
            {"Values" "{:v \"No Encoder\"}"}
            {"Values" "ABC"}]
           (->> (spreadsheet/create-workbook "Results" [["values"]
                                                        [(SampleNastyClass. "Hello XLSX World!")]
                                                        [(AnotherNastyClass. "No Encoder")]
                                                        ["ABC"]])
                (spreadsheet/select-sheet "Results")
                (spreadsheet/select-columns {:A "Values"}))))))

(ns metabase.tiles.util-test
  "Tests for tile utility functions."
  (:require
   [clojure.test :refer :all]
   [metabase.tiles.util :as tiles.util]
   [metabase.util.json :as json])
  (:import
   (java.util Base64)))

(defn- encode-field-ref-as-base64
  "Helper function to encode a field ref as URL-safe base64, matching frontend implementation."
  [field-ref]
  (let [json-str (json/encode field-ref)
        base64-str (.encodeToString (Base64/getEncoder) (.getBytes json-str "UTF-8"))]
    (-> base64-str
        (clojure.string/replace "+" "-")
        (clojure.string/replace "/" "_")
        (clojure.string/replace #"=+$" ""))))

(deftest decode-field-ref-test
  (testing "decodes field refs"
    ;; Frontend sends JSON arrays with strings, backend decodes to vectors with strings
    (let [test-cases [["field" 123 nil]
                      ["field" 123 {:base-type "type/Float"}]
                      ["aggregation" 0]]]
      (doseq [field-ref test-cases]
        (let [encoded (encode-field-ref-as-base64 field-ref)
              decoded (tiles.util/decode-field-ref encoded)]
          (is (= field-ref decoded))))))

  (testing "throws exception for invalid input"
    (is (thrown? Exception (tiles.util/decode-field-ref "invalid!!!")))))

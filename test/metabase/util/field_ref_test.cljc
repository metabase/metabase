(ns metabase.util.field-ref-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.util.field-ref :as field-ref]))

(deftest encode-decode-field-ref-roundtrip-test
  (testing "Field ref encoding/decoding roundtrip works correctly"
    (let [field-refs [["field" 123 nil]
                      ["field" 456 {:base-type "type/Float"}]
                      ["field" "ORDERS" {:base-type "type/Integer"}]]]
      (doseq [field-ref field-refs]
        (is (= field-ref
               (field-ref/decode-field-ref-from-url
                (field-ref/encode-field-ref-for-url field-ref))))))))

(deftest encode-field-ref-url-safe-test
  (testing "Encoded field refs are URL-safe"
    (let [field-ref ["field" 123 {:base-type "type/Float"}]
          encoded (field-ref/encode-field-ref-for-url field-ref)]
      (is (not (re-find #"[+/=]" encoded))
          "Encoded field ref should not contain +, /, or = characters"))))

(deftest encode-field-ref-for-url-test
  (testing "encodes field refs as URL-safe base64"
    (is (= "WyJmaWVsZCIsMTIzLG51bGxd"
           (field-ref/encode-field-ref-for-url ["field" 123 nil])))
    (is (= "WyJhZ2dyZWdhdGlvbiIsMF0"
           (field-ref/encode-field-ref-for-url ["aggregation" 0])))))

(ns metabase.query-processor.parameters.binary-test
  (:require
   [clojure.test :refer :all]
   [metabase.query-processor.parameters.values :as values]
   [metabase.util.json :as json]))

(deftest parse-binary-value-test
  (testing "Parsing binary values from strings"
    (testing "base64 strings"
      (let [base64-str "SGVsbG8gV29ybGQ="  ; "Hello World" in base64
            result (#'values/parse-binary-value base64-str)]
        (is (bytes? result))
        (is (= "Hello World" (String. result "UTF-8")))))
    
    (testing "hex strings with 0x prefix"
      (let [hex-str "0x48656c6c6f"  ; "Hello" in hex
            result (#'values/parse-binary-value hex-str)]
        (is (bytes? result))
        (is (= "Hello" (String. result "UTF-8")))))
    
    (testing "invalid base64 returns string as-is"
      (let [invalid-str "not-base64!!!"
            result (#'values/parse-binary-value invalid-str)]
        (is (= invalid-str result))))
    
    (testing "invalid hex returns string as-is"
      (let [invalid-hex "0xnotvalidhex"
            result (#'values/parse-binary-value invalid-hex)]
        (is (= invalid-hex result))))
    
    (testing "non-string values pass through"
      (let [byte-array (byte-array [1 2 3])
            result (#'values/parse-binary-value byte-array)]
        (is (= byte-array result))))))

(deftest parse-tag-binary-test
  (testing "Binary parameter tag parsing"
    (let [tag {:type "binary" :name "binary_param" :display-name "Binary Param"}
          params [{:type "binary" :target ["variable" ["template-tag" "binary_param"]] :value "SGVsbG8="}]]
      (is (some? (values/parse-tag nil tag params))))))

(deftest parse-value-for-field-type-binary-test
  (testing "Parsing values for binary field types"
    (testing "with :type/Binary effective type"
      (let [result (#'values/parse-value-for-field-type :type/Binary "SGVsbG8gV29ybGQ=")]
        (is (bytes? result))
        (is (= "Hello World" (String. result "UTF-8")))))
    
    (testing "with :type/PostgresBytea effective type"
      (let [result (#'values/parse-value-for-field-type :type/PostgresBytea "0x48656c6c6f")]
        (is (bytes? result))
        (is (= "Hello" (String. result "UTF-8")))))
    
    (testing "with :type/Hash effective type"
      (let [result (#'values/parse-value-for-field-type :type/Hash "0x1234abcd")]
        (is (bytes? result))))))
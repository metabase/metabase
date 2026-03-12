(ns metabase-enterprise.action-v2.validation-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.action-v2.validation :as validation]))

 ;; Test field definitions

(def float-field
  {:name "price" :base_type :type/Float :database_required false})

(def float-field-required
  {:name "price" :base_type :type/Float :database_required true})

(def integer-field
  {:name "count" :base_type :type/Integer :database_required false})

(def integer-field-required
  {:name "count" :base_type :type/Integer :database_required true})

(def number-field
  {:name "value" :base_type :type/Number :database_required false})

(def number-field-required
  {:name "value" :base_type :type/Number :database_required true})

(def text-field
  {:name "name" :base_type :type/Text :database_required false})

(def text-field-required
  {:name "name" :base_type :type/Text :database_required true})

(def boolean-field
  {:name "active" :base_type :type/Boolean :database_required false})

(def boolean-field-required
  {:name "active" :base_type :type/Boolean :database_required true})

(def date-field
  {:name "birth_date" :base_type :type/Date :database_required false})

(def date-field-required
  {:name "birth_date" :base_type :type/Date :database_required true})

(def time-field
  {:name "start_time" :base_type :type/Time :database_required false})

(def time-field-required
  {:name "start_time" :base_type :type/Time :database_required true})

(def datetime-field
  {:name "created_at" :base_type :type/DateTime :database_required false})

(def datetime-field-required
  {:name "created_at" :base_type :type/DateTime :database_required true})

(def biginteger-field
  {:name "big_count" :base_type :type/BigInteger :database_required false})

(def biginteger-field-required
  {:name "big_count" :base_type :type/BigInteger :database_required true})

(def decimal-field
  {:name "precise_value" :base_type :type/Decimal :database_required false})

(def decimal-field-required
  {:name "precise_value" :base_type :type/Decimal :database_required true})

(deftest validate-inputs-float-test
  (testing "Float type validation"
    (doseq [[expected inputs fields]
            [;; Valid cases
             [nil [{"price" "123.45"}] [float-field]]
             [nil [{"price" 123.45}] [float-field]]
             [nil [{"price" 123}] [float-field]]
             [nil [{"price" "0"}] [float-field]]
             [nil [{"price" "-123.45"}] [float-field]]
             [nil [{"price" nil}] [float-field]]

             ;; Invalid cases
             [[{"price" "Must be a number"}] [{"price" "not-a-number"}] [float-field]]
             [[{"price" "Must be a number"}] [{"price" "12.34.56"}] [float-field]]
             [[{"price" "Must be a number"}] [{"price" ""}] [float-field]]
             [[{"price" "Must be a number"}] [{"price" "  "}] [float-field]]
             [[{"price" "Must be a number"}] [{"price" true}] [float-field]]
             [[{"price" "This field is required"}] [{"price" nil}] [float-field-required]]]]

      (testing (str "Float validation - inputs: " inputs)
        (is (= expected (validation/validate-inputs fields inputs)))))))

(deftest validate-inputs-integer-test
  (testing "Integer type validation"
    (doseq [[expected inputs fields]
            [;; Valid cases
             [nil [{"count" "123"}] [integer-field]]
             [nil [{"count" 123}] [integer-field]]
             [nil [{"count" "0"}] [integer-field]]
             [nil [{"count" "-456"}] [integer-field]]
             [nil [{"count" nil}] [integer-field]]

             ;; Invalid cases
             [[{"count" "Must be an integer"}] [{"count" "123.45"}] [integer-field]]
             [[{"count" "Must be an integer"}] [{"count" "abc"}] [integer-field]]
             [[{"count" "Must be an integer"}] [{"count" 123.45}] [integer-field]]
             [[{"count" "Must be an integer"}] [{"count" ""}] [integer-field]]
             [[{"count" "Must be an integer"}] [{"count" "1.0"}] [integer-field]]
             [[{"count" "Must be an integer"}] [{"count" true}] [integer-field]]
             [[{"count" "This field is required"}] [{"count" nil}] [integer-field-required]]]]

      (testing (str "Integer validation - inputs: " inputs)
        (is (= expected (validation/validate-inputs fields inputs)))))))

(deftest validate-inputs-number-test
  (testing "Number type validation"
    (doseq [[expected inputs fields]
            [;; Valid cases
             [nil [{"value" "123"}] [number-field]]
             [nil [{"value" "123.45"}] [number-field]]
             [nil [{"value" 123}] [number-field]]
             [nil [{"value" 123.45}] [number-field]]
             [nil [{"value" "-999.99"}] [number-field]]
             [nil [{"value" nil}] [number-field]]

             ;; Invalid cases
             [[{"value" "Must be a number"}] [{"value" "not-a-number"}] [number-field]]
             [[{"value" "Must be a number"}] [{"value" "12.34.56"}] [number-field]]
             [[{"value" "Must be a number"}] [{"value" ""}] [number-field]]
             [[{"value" "Must be a number"}] [{"value" false}] [number-field]]
             [[{"value" "This field is required"}] [{"value" nil}] [number-field-required]]]]

      (testing (str "Number validation - inputs: " inputs)
        (is (= expected (validation/validate-inputs fields inputs)))))))

(deftest validate-inputs-text-test
  (testing "Text type validation"
    (doseq [[expected inputs fields]
            [;; Valid cases
             [nil [{"name" "John Doe"}] [text-field]]
             [nil [{"name" ""}] [text-field]]
             [nil [{"name" "  spaces  "}] [text-field]]
             [nil [{"name" "123"}] [text-field]]
             [nil [{"name" nil}] [text-field]]

             ;; Invalid cases
             [[{"name" "Must be a text string"}] [{"name" 123}] [text-field]]
             [[{"name" "Must be a text string"}] [{"name" true}] [text-field]]
             [[{"name" "Must be a text string"}] [{"name" false}] [text-field]]
             [[{"name" "Must be a text string"}] [{"name" {:key "value"}}] [text-field]]
             [[{"name" "This field is required"}] [{"name" nil}] [text-field-required]]]]

      (testing (str "Text validation - inputs: " inputs)
        (is (= expected (validation/validate-inputs fields inputs)))))))

(deftest validate-inputs-boolean-test
  (testing "Boolean type validation"
    (doseq [[expected inputs fields]
            [;; Valid cases
             [nil [{"active" "true"}] [boolean-field]]
             [nil [{"active" "false"}] [boolean-field]]
             [nil [{"active" "TRUE"}] [boolean-field]]
             [nil [{"active" "False"}] [boolean-field]]
             [nil [{"active" "1"}] [boolean-field]]
             [nil [{"active" "0"}] [boolean-field]]
             [nil [{"active" true}] [boolean-field]]
             [nil [{"active" false}] [boolean-field]]
             [nil [{"active" nil}] [boolean-field]]

             ;; Invalid cases
             [[{"active" "Must be true, false, 0, or 1"}] [{"active" "yes"}] [boolean-field]]
             [[{"active" "Must be true, false, 0, or 1"}] [{"active" "no"}] [boolean-field]]
             [[{"active" "Must be true, false, 0, or 1"}] [{"active" "2"}] [boolean-field]]
             [[{"active" "Must be true, false, 0, or 1"}] [{"active" ""}] [boolean-field]]
             [[{"active" "Must be true, false, 0, or 1"}] [{"active" 123}] [boolean-field]]
             [[{"active" "Must be true, false, 0, or 1"}] [{"active" 1}] [boolean-field]]
             [[{"active" "This field is required"}] [{"active" nil}] [boolean-field-required]]]]

      (testing (str "Boolean validation - inputs: " inputs)
        (is (= expected (validation/validate-inputs fields inputs)))))))

(deftest validate-inputs-date-test
  (testing "Date type validation"
    (doseq [[expected inputs fields]
            [;; Valid cases
             [nil [{"birth_date" "2024-03-15"}] [date-field]]
             [nil [{"birth_date" "1999-12-31"}] [date-field]]
             [nil [{"birth_date" "2024-01-01"}] [date-field]]
             [nil [{"birth_date" nil}] [date-field]]

             ;; Invalid cases
             [[{"birth_date" "Must be a valid date in format YYYY-MM-DD"}] [{"birth_date" "2024-13-15"}] [date-field]]
             [[{"birth_date" "Must be a valid date in format YYYY-MM-DD"}] [{"birth_date" "2024-3-15"}] [date-field]]
             [[{"birth_date" "Must be a valid date in format YYYY-MM-DD"}] [{"birth_date" "2024-03-5"}] [date-field]]
             [[{"birth_date" "Must be a valid date in format YYYY-MM-DD"}] [{"birth_date" "03/15/2024"}] [date-field]]
             [[{"birth_date" "Must be a valid date in format YYYY-MM-DD"}] [{"birth_date" "15-03-2024"}] [date-field]]
             [[{"birth_date" "Must be a valid date in format YYYY-MM-DD"}] [{"birth_date" "2024/03/15"}] [date-field]]
             [[{"birth_date" "Must be a valid date in format YYYY-MM-DD"}] [{"birth_date" "March 15, 2024"}] [date-field]]
             [[{"birth_date" "Must be a valid date in format YYYY-MM-DD"}] [{"birth_date" ""}] [date-field]]
             [[{"birth_date" "Must be a valid date in format YYYY-MM-DD"}] [{"birth_date" 123}] [date-field]]
             [[{"birth_date" "Must be a valid date in format YYYY-MM-DD"}] [{"birth_date" "2024-13-13"}] [date-field]]
             [[{"birth_date" "This field is required"}] [{"birth_date" nil}] [date-field-required]]]]

      (testing (str "Date validation - inputs: " inputs)
        (is (= expected (validation/validate-inputs fields inputs)))))))

(deftest validate-inputs-time-test
  (testing "Time type validation"
    (doseq [[expected inputs fields]
            [;; Valid cases
             [nil [{"start_time" "14:30"}] [time-field]]
             [nil [{"start_time" "14:30:00"}] [time-field]]
             [nil [{"start_time" "00:00:00"}] [time-field]]
             [nil [{"start_time" "23:59:59"}] [time-field]]
             [nil [{"start_time" nil}] [time-field]]

             ;; Invalid cases
             [[{"start_time" "Must be a valid time in format HH:mm:ss"}] [{"start_time" "2:30:00"}] [time-field]]
             [[{"start_time" "Must be a valid time in format HH:mm:ss"}] [{"start_time" "14:3:00"}] [time-field]]
             [[{"start_time" "Must be a valid time in format HH:mm:ss"}] [{"start_time" "14:30:0"}] [time-field]]
             [[{"start_time" "Must be a valid time in format HH:mm:ss"}] [{"start_time" "2:30 PM"}] [time-field]]
             [[{"start_time" "Must be a valid time in format HH:mm:ss"}] [{"start_time" "25:00:00"}] [time-field]]
             [[{"start_time" "Must be a valid time in format HH:mm:ss"}] [{"start_time" ""}] [time-field]]
             [[{"start_time" "Must be a valid time in format HH:mm:ss"}] [{"start_time" 143000}] [time-field]]
             [[{"start_time" "This field is required"}] [{"start_time" nil}] [time-field-required]]]]

      (testing (str "Time validation - inputs: " inputs)
        (is (= expected (validation/validate-inputs fields inputs)))))))

(deftest validate-inputs-datetime-test
  (testing "DateTime type validation"
    (doseq [[expected inputs fields]
            [;; Valid cases
             [nil [{"created_at" "2024-03-15T14:30:00"}] [datetime-field]]
             [nil [{"created_at" "2024-03-15T14:30:00-07:00"}] [datetime-field]]
             [nil [{"created_at" "2024-03-15T14:30:00Z"}] [datetime-field]]
             [nil [{"created_at" "2024-03-15T14:30:00"}] [datetime-field]]
             [nil [{"created_at" "2024-03-15T14:30"}] [datetime-field]]
             [nil [{"created_at" nil}] [datetime-field]]

             ;; Invalid cases
             [[{"created_at" "Must be a valid datetime in format YYYY-MM-DDTHH:mm:ss or YYYY-MM-DDTHH:mm:ssZ"}]
              [{"created_at" "2024-03-15"}] [datetime-field]]
             [[{"created_at" "Must be a valid datetime in format YYYY-MM-DDTHH:mm:ss or YYYY-MM-DDTHH:mm:ssZ"}]
              [{"created_at" "2024-13-13"}] [datetime-field]]
             [[{"created_at" "Must be a valid datetime in format YYYY-MM-DDTHH:mm:ss or YYYY-MM-DDTHH:mm:ssZ"}]
              [{"created_at" "2024-3-15 14:30:00"}] [datetime-field]]
             [[{"created_at" "Must be a valid datetime in format YYYY-MM-DDTHH:mm:ss or YYYY-MM-DDTHH:mm:ssZ"}]
              [{"created_at" "2024-03-15 2:30:00"}] [datetime-field]]
             [[{"created_at" "Must be a valid datetime in format YYYY-MM-DDTHH:mm:ss or YYYY-MM-DDTHH:mm:ssZ"}]
              [{"created_at" "03/15/2024 14:30:00"}] [datetime-field]]
             [[{"created_at" "Must be a valid datetime in format YYYY-MM-DDTHH:mm:ss or YYYY-MM-DDTHH:mm:ssZ"}]
              [{"created_at" ""}] [datetime-field]]
             [[{"created_at" "Must be a valid datetime in format YYYY-MM-DDTHH:mm:ss or YYYY-MM-DDTHH:mm:ssZ"}]
              [{"created_at" 1234567890}] [datetime-field]]
             [[{"created_at" "This field is required"}]
              [{"created_at" nil}] [datetime-field-required]]]]

      (testing (str "DateTime validation - inputs: " inputs)
        (is (= expected (validation/validate-inputs fields inputs)))))))

(deftest validate-inputs-biginteger-test
  (testing "BigInteger type validation"
    (doseq [[expected inputs fields]
            [;; Valid cases - regular integers
             [nil [{"big_count" "123"}] [biginteger-field]]
             [nil [{"big_count" 123}] [biginteger-field]]
             [nil [{"big_count" "0"}] [biginteger-field]]
             [nil [{"big_count" "-456"}] [biginteger-field]]
             [nil [{"big_count" nil}] [biginteger-field]]

             ;; Valid cases - large integers that exceed Long.MAX_VALUE
             [nil [{"big_count" "9223372036854775808"}] [biginteger-field]] ; Long.MAX_VALUE + 1
             [nil [{"big_count" "92233720368547758070"}] [biginteger-field]] ; Much larger
             [nil [{"big_count" "-9223372036854775809"}] [biginteger-field]] ; Long.MIN_VALUE - 1

             ;; Invalid cases
                          ;; Invalid cases
             [[{"big_count" "Must be an integer"}] [{"big_count" "123.45"}] [biginteger-field]]
             [[{"big_count" "Must be an integer"}] [{"big_count" "abc"}] [biginteger-field]]
             [[{"big_count" "Must be an integer"}] [{"big_count" 123.45}] [biginteger-field]]
             [[{"big_count" "Must be an integer"}] [{"big_count" ""}] [biginteger-field]]
             [[{"big_count" "Must be an integer"}] [{"big_count" "1.0"}] [biginteger-field]]
             [[{"big_count" "Must be an integer"}] [{"big_count" true}] [biginteger-field]]
             [[{"big_count" "This field is required"}] [{"big_count" nil}] [biginteger-field-required]]]]

      (testing (str "BigInteger validation - inputs: " inputs)
        (is (= expected (validation/validate-inputs fields inputs)))))))

(deftest validate-inputs-decimal-test
  (testing "Decimal type validation"
    (doseq [[expected inputs fields]
            [;; Valid cases - regular numbers
             [nil [{"precise_value" "123.45"}] [decimal-field]]
             [nil [{"precise_value" 123.45}] [decimal-field]]
             [nil [{"precise_value" 123}] [decimal-field]]
             [nil [{"precise_value" "0"}] [decimal-field]]
             [nil [{"precise_value" "-123.45"}] [decimal-field]]
             [nil [{"precise_value" nil}] [decimal-field]]

             ;; Valid cases - high precision decimals that exceed Double precision
             [nil [{"precise_value" "123.456789012345678901234567890"}] [decimal-field]]
             [nil [{"precise_value" "99999999999999999999.99999999999999999999"}] [decimal-field]]
             [nil [{"precise_value" "-0.000000000000000000000000000001"}] [decimal-field]]

             ;; Invalid cases
             [[{"precise_value" "Must be a number"}] [{"precise_value" "not-a-number"}] [decimal-field]]
             [[{"precise_value" "Must be a number"}] [{"precise_value" "12.34.56"}] [decimal-field]]
             [[{"precise_value" "Must be a number"}] [{"precise_value" ""}] [decimal-field]]
             [[{"precise_value" "Must be a number"}] [{"precise_value" "  "}] [decimal-field]]
             [[{"precise_value" "Must be a number"}] [{"precise_value" true}] [decimal-field]]
             [[{"precise_value" "This field is required"}] [{"precise_value" nil}] [decimal-field-required]]]]

      (testing (str "Decimal validation - inputs: " inputs)
        (is (= expected (validation/validate-inputs fields inputs)))))))

(deftest validate-inputs-multiple-fields-test
  (testing "Multiple fields and rows validation"
    (testing "Multiple fields in single row"
      (is (= nil
             (validation/validate-inputs
              [text-field integer-field boolean-field]
              [{"name" "John" "count" "30" "active" "true"}]))))

    (testing "Multiple errors in single row"
      (is (= [{"name" "This field is required" "count" "Must be an integer" "active" "Must be true, false, 0, or 1"}]
             (validation/validate-inputs
              [text-field-required integer-field boolean-field]
              [{"name" nil "count" "thirty" "active" "maybe"}]))))

    (testing "Multiple rows"
      (is (= [{"count" "Must be an integer"} {"count" "Must be an integer"}]
             (validation/validate-inputs
              [text-field integer-field]
              [{"name" "John" "count" "thirty"}
               {"name" "Jane" "count" "twenty-five"}]))))

    (testing "Unknown fields are ignored"
      (is (= nil
             (validation/validate-inputs
              [text-field]
              [{"unknown_field" "value" "another_unknown" 123 "name" "John"}]))))))

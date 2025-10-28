(ns representations.schema.v0.column-test
  (:require [clojure.test :refer [deftest testing is]]
            [representations.schema.v0.column :as column]
            [representations.util.malli :as mu]))

(deftest column-name-test
  (testing "valid column name"
    (is (= "user_id" (mu/coerce ::column/column-name "user_id"))))
  (testing "rejects blank string"
    (is (thrown? Exception (mu/coerce ::column/column-name ""))))
  (testing "rejects nil"
    (is (thrown? Exception (mu/coerce ::column/column-name nil)))))

(deftest display-name-test
  (testing "valid display name"
    (is (= "User ID" (mu/coerce ::column/display-name "User ID"))))
  (testing "rejects blank string"
    (is (thrown? Exception (mu/coerce ::column/display-name ""))))
  (testing "rejects nil"
    (is (thrown? Exception (mu/coerce ::column/display-name nil)))))

(deftest column-description-test
  (testing "valid description string"
    (is (= "The unique identifier for a user"
           (mu/coerce ::column/column-description "The unique identifier for a user"))))
  (testing "accepts nil"
    (is (nil? (mu/coerce ::column/column-description nil))))
  (testing "accepts empty string"
    (is (= "" (mu/coerce ::column/column-description "")))))

(deftest normalize-type-string-test
  (testing "normalizes keyword type"
    (is (= :type/Text (column/normalize-type-string :type/Text))))
  (testing "normalizes string with type/ prefix"
    (is (= :type/Text (column/normalize-type-string "type/Text"))))
  (testing "normalizes string with :type/ prefix"
    (is (= :type/Text (column/normalize-type-string ":type/Text"))))
  (testing "normalizes bare string"
    (is (= :type/Text (column/normalize-type-string "Text"))))
  (testing "handles nil"
    (is (nil? (column/normalize-type-string nil)))))

(deftest visibility-test
  (testing "accepts valid visibility values"
    (is (= "normal" (mu/coerce ::column/visibility "normal")))
    (is (= "sensitive" (mu/coerce ::column/visibility "sensitive")))
    (is (= "retired" (mu/coerce ::column/visibility "retired")))
    (is (= "hidden" (mu/coerce ::column/visibility "hidden"))))
  (testing "rejects invalid visibility"
    (is (thrown? Exception (mu/coerce ::column/visibility "invalid")))))

(deftest currency-test
  (testing "valid currency code"
    (is (= "USD" (mu/coerce ::column/currency "USD")))
    (is (= "EUR" (mu/coerce ::column/currency "EUR"))))
  (testing "rejects blank string"
    (is (thrown? Exception (mu/coerce ::column/currency ""))))
  (testing "rejects nil"
    (is (thrown? Exception (mu/coerce ::column/currency nil)))))

(deftest column-test
  (testing "minimal valid column"
    (let [col {:name "user_id"}]
      (is (= col (mu/coerce ::column/column col)))))
  (testing "column with all optional fields"
    (let [col {:name "price"
               :display_name "Price"
               :description "Product price"
               :visibility "normal"
               :currency "USD"}]
      (is (= col (mu/coerce ::column/column col)))))
  (testing "rejects column without name"
    (is (thrown? Exception (mu/coerce ::column/column {:display_name "Price"})))))

(deftest columns-test
  (testing "valid array of columns"
    (let [cols [{:name "id"}
                {:name "name" :display_name "User Name"}
                {:name "price" :currency "USD"}]]
      (is (= cols (mu/coerce ::column/columns cols)))))
  (testing "empty array is valid"
    (is (= [] (mu/coerce ::column/columns []))))
  (testing "rejects non-array"
    (is (thrown? Exception (mu/coerce ::column/columns {:name "id"})))))

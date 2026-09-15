(ns metabase.transform-testing.validator-test
  "Guard A: every table the transform reads must have a declared input. Pure — no warehouse."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.transform-testing.validator :as validator]))

(defn- sql-input [schema name]
  {:table {:schema schema :name name} :format :sql :sql "SELECT 1"})

(deftest missing-inputs-complete-test
  (testing "no missing inputs when every referenced table is declared"
    (is (= [] (validator/missing-inputs
               :h2
               [(sql-input "PUBLIC" "PEOPLE") (sql-input "PUBLIC" "ORDERS")]
               #{{:schema "PUBLIC" :name "PEOPLE"} {:schema "PUBLIC" :name "ORDERS"}})))))

(deftest missing-inputs-undeclared-test
  (testing "an undeclared referenced table is reported"
    (is (= [{:schema "PUBLIC" :name "ORDERS"}]
           (validator/missing-inputs
            :h2
            [(sql-input "PUBLIC" "PEOPLE")]
            #{{:schema "PUBLIC" :name "PEOPLE"} {:schema "PUBLIC" :name "ORDERS"}}))))
  (testing "with nothing declared, every referenced table is reported"
    (is (= #{{:schema nil :name "PEOPLE"} {:schema nil :name "ORDERS"}}
           (set (validator/missing-inputs
                 :h2 [] #{{:schema nil :name "PEOPLE"} {:schema nil :name "ORDERS"}}))))))

(deftest missing-inputs-schema-defaulting-test
  (testing "a bare reference is covered by a declared input in the driver's default schema"
    ;; H2 default-schema is PUBLIC: bare PEOPLE ⇔ PUBLIC.PEOPLE. This is the case Alex's runner
    ;; test hits (transform reads bare PEOPLE, input declares {:schema PUBLIC}).
    (is (= [] (validator/missing-inputs
               :h2 [(sql-input "PUBLIC" "PEOPLE")] #{{:schema nil :name "PEOPLE"}}))))
  (testing "a bare reference is NOT covered by a declared input in a non-default schema"
    (is (= [{:schema nil :name "PEOPLE"}]
           (validator/missing-inputs
            :h2 [(sql-input "OTHER" "PEOPLE")] #{{:schema nil :name "PEOPLE"}}))))
  (testing "an explicitly-schemaed reference requires an exact schema match"
    (is (= [{:schema "ANALYTICS" :name "PEOPLE"}]
           (validator/missing-inputs
            :h2 [(sql-input "PUBLIC" "PEOPLE")] #{{:schema "ANALYTICS" :name "PEOPLE"}})))))

(deftest table-label-test
  (testing "table-label renders schema.name, or bare name when schema unknown — never a raw map"
    (is (= "PEOPLE" (validator/table-label {:schema nil :name "PEOPLE"})))
    (is (= "PUBLIC.PEOPLE" (validator/table-label {:schema "PUBLIC" :name "PEOPLE"})))))

(deftest missing-inputs-name-mismatch-test
  (testing "same schema, different name is not a match"
    (is (= [{:schema "PUBLIC" :name "ORDERS"}]
           (validator/missing-inputs
            :h2 [(sql-input "PUBLIC" "PEOPLE")] #{{:schema "PUBLIC" :name "ORDERS"}})))))

(ns metabase.native-query-analyzer.replacement-test
  (:require
   [clojure.test :refer :all]
   [metabase.native-query-analyzer.replacement :refer [replace-names]]
   [metabase.test :as mt]))

(defn- q
  "Make a native query from the concatenation of the args"
  [& args]
  (mt/native-query {:query (apply str args)}))

(deftest ^:parallel replace-names-simple-test
  (testing "columns can be renamed"
    (is (= "select cost from orders"
           (replace-names (q "select amount from orders") {:columns {"amount" "cost"}})) ))
  (testing "tables can be renamed"
    (is (= "select amount from purchases"
           (replace-names (q "select amount from orders") {:tables {"orders" "purchases"}})) ))
  (testing "many things can be renamed at once"
    (is (= "select cost, tax from purchases"
           (replace-names (q "select amount, fee from orders") {:columns {"amount" "cost"
                                                                          "fee"    "tax"}
                                                              :tables {"orders" "purchases"}})) )))

(deftest ^:parallel replace-names-whitespace-test
  (testing "comments, whitespace, etc. are preserved"
    (is (= (str "select cost, tax -- from orders\n"
                "from purchases")
           (replace-names (q "select amount, fee -- from orders\n"
                             "from orders")
                          {:columns {"amount" "cost"
                                     "fee"    "tax"}
                           :tables {"orders" "purchases"}})) )))

(deftest ^:parallel variables-test
  (testing "with variables (template tags)"
    (is (= (str "\n\nSELECT *\nFROM folk\nWHERE\n  referral = {{source}}\n  OR \n  id = {{id}}\n  OR \n  birthday = "
                "{{birthday}}\n  OR\n  zip = {{zipcode}}")
           (replace-names (q "\n\nSELECT *\nFROM people\nWHERE\n  source = {{source}}\n  OR \n  id = {{id}}\n  OR \n"
                             "  birth_date = {{birthday}}\n  OR\n  zip = {{zipcode}}")
                          {:columns {"source"     "referral"
                                     "birth_date" "birthday"}
                           :tables  {"people" "folk"}})))))

(deftest ^:parallel field-filter-test
  (testing "with variables *and* field filters"
    (is (= (str "\n\nSELECT *\nFROM folk\nWHERE\n  referral = {{source}}\n   OR \n  id = {{id}} \n  OR \n"
                "  {{birthday}}\n  OR\n  {{zipcode}}\n  OR\n  {{city}} ")
           (replace-names (q "\n\nSELECT *\nFROM people\nWHERE\n  source = {{source}}\n   OR \n  id = {{id}} \n  OR \n"
                             "  {{birthday}}\n  OR\n  {{zipcode}}\n  OR\n  {{city}} ")
                          {:columns {"source" "referral"
                                     "city"   "town"}  ; make sure FFs aren't replaced
                           :tables  {"people" "folk"}})))))

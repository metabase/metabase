(ns metabase.native-query-analyzer.replacement-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.native :as lib-native]
   [metabase.native-query-analyzer.replacement :refer [replace-names]]
   [metabase.test :as mt]
   [toucan2.tools.with-temp :as t2.with-temp]))

(defn- q
  "Make a native query from the concatenation of the args"
  [& args]
  (let [query (apply str args)]
    (mt/native-query {:query         query
                      :template-tags (lib-native/extract-template-tags query)})))

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
    (is (= (str "SELECT *\nFROM folk\nWHERE\n  referral = {{source}}\n   OR \n  id = {{id}} \n  OR \n"
                "  {{birthday}}\n  OR\n  {{zipcode}}\n  OR\n  {{city}} ")
           (replace-names (q "SELECT *\nFROM people\nWHERE\n  source = {{source}}\n   OR \n  id = {{id}} \n  OR \n"
                             "  {{birthday}}\n  OR\n  {{zipcode}}\n  OR\n  {{city}} ")
                          {:columns {"source" "referral"
                                     "city"   "town"}  ; make sure FFs aren't replaced
                           :tables  {"people" "folk"}})))))

(deftest referenced-card-test
  (testing "With a reference to a card"
    (t2.with-temp/with-temp
      [:model/Card {card-id :id} {:type          :model
                                  :dataset_query (mt/native-query {:query "SELECT total, tax FROM orders"})}]
      (is (= (format "SELECT subtotal FROM {{#%s}} LIMIT 3" card-id)
             (replace-names (q (format "SELECT total FROM {{#%s}} LIMIT 3" card-id))
                            {:columns {"total" "subtotal"}
                             :tables  {"orders" "purchases"}}))))))

(deftest snippet-test
  (testing "With a snippet"
    (t2.with-temp/with-temp
      [:model/NativeQuerySnippet {snippet-id :id} {:name    "a lovely snippet"
                                                   :content "where subtotal > 10"}]
      (is (= "SELECT amount FROM purchases {{snippet: a lovely snippet}}"
             (replace-names (assoc-in
                             (q "SELECT total FROM orders {{snippet: a lovely snippet}}")
                             [:native :template-tags "snippet: a lovely snippet" :snippet-id]
                             snippet-id)
                            {:columns {"total" "amount"}
                             :tables  {"orders" "purchases"}}))))))

(deftest ^:parallel optional-test
  (testing "With optional tags"
    (is (= "SELECT cost FROM purchases WHERE id IS NOT NULL [[ AND pretax > {{subtotal}} ]] [[ AND {{amazing_filter}} ]]"
           (replace-names (q "SELECT total FROM orders WHERE id IS NOT NULL [[ AND subtotal > {{subtotal}} ]] [[ AND {{amazing_filter}} ]]")
                          {:columns {"total"    "cost"
                                     "subtotal" "pretax"}
                           :tables {"orders" "purchases"}})))))

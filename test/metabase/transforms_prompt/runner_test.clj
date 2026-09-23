(ns ^:mb/driver-tests metabase.transforms-prompt.runner-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.self :as metabot.self]
   [metabase.test :as mt]
   [metabase.transforms-prompt.llm :as llm]
   [metabase.transforms-prompt.runner :as runner]
   [metabase.transforms.execute :as transforms.execute]
   [metabase.transforms.test-dataset :as transforms-dataset]
   [metabase.transforms.test-util :as transforms.tu :refer [with-transform-cleanup!]]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(deftest prompt-transform-run-test
  (testing "a prompt() transform fills columns from the LLM and evaluates duplicate prompt text once"
    (mt/test-driver :postgres
      (mt/dataset transforms-dataset/transforms-test
        (let [schema (t2/select-one-fn :schema :model/Table (mt/id :transforms_products))]
          (with-transform-cleanup! [{table-name :name :as target} {:type   "table"
                                                                   :schema schema
                                                                   :name   "prompt_out"}]
            (let [mp       (mt/metadata-provider)
                  products (lib.metadata/table mp (mt/id :transforms_products))
                  category (lib.metadata/field mp (mt/id :transforms_products :category))
                  query    (-> (lib/query mp products)
                               (lib/expression "Note" (lib/prompt "rate this"))
                               (lib/expression "Sentiment" (lib/prompt category))
                               (lib/limit 5))
                  calls    (atom [])]
              (mt/with-temp [:model/Transform transform {:name   "Prompt transform"
                                                         :source {:type :query :query query}
                                                         :target (assoc target :database (mt/id))}]
                (with-redefs [metabot.self/llm-call-unavailable-reason (constantly nil)
                              llm/evaluate-prompt (fn [text _output]
                                                    (swap! calls conj text)
                                                    (str "ans:" text))]
                  (transforms.execute/execute! transform {:run-method :manual
                                                          :user-id     (mt/user->id :crowberto)}))
                (transforms.tu/wait-for-table table-name 10000)
                (testing "the constant prompt is sent once for the whole run"
                  (is (= 1 (count (filter #{"rate this"} @calls)))))
                (testing "every distinct prompt text is evaluated once"
                  (is (= (count @calls) (count (distinct @calls)))))
                (let [rows (transforms.tu/table-rows table-name)]
                  (is (seq rows))
                  (is (some #(some #{"ans:rate this"} %) rows)
                      "the constant prompt column is replaced with the LLM answer"))))))))))

(defn- field-by-name
  [table-name field-name]
  (let [table (t2/select-one :model/Table :db_id (mt/id) :name table-name :active true)]
    (t2/select-one :model/Field :table_id (:id table) :name field-name)))

(deftest prompt-transform-typed-output-test
  (testing "prompt() columns take their type from the output spec, coerce answers, and cache by [schema text]"
    (mt/test-driver :postgres
      (mt/dataset transforms-dataset/transforms-test
        (let [schema (t2/select-one-fn :schema :model/Table (mt/id :transforms_products))]
          (with-transform-cleanup! [{table-name :name :as target} {:type   "table"
                                                                   :schema schema
                                                                   :name   "prompt_typed"}]
            (let [mp       (mt/metadata-provider)
                  products (lib.metadata/table mp (mt/id :transforms_products))
                  query    (-> (lib/query mp products)
                               (lib/expression "Score"
                                               (lib/expression-clause :prompt ["same"] {:return-type :integer}))
                               (lib/expression "Flag"
                                               (lib/expression-clause :prompt ["flag"] {:return-type :boolean}))
                               (lib/expression "On"
                                               (lib/expression-clause :prompt ["on"] {:return-type :date}))
                               (lib/expression "Extracted"
                                               (lib/expression-clause :prompt ["extract"]
                                                                      {:json-schema "{\"type\": \"object\", \"properties\": {\"product\": {\"type\": \"string\"}}}"}))
                               (lib/expression "AsText"
                                               (lib/expression-clause :prompt ["same"] {:return-type :text}))
                               (lib/expression "Bad"
                                               (lib/expression-clause :prompt ["mismatch"] {:return-type :integer}))
                               (lib/limit 3))
                  calls    (atom [])]
              (mt/with-temp [:model/Transform transform {:name   "Typed prompt transform"
                                                         :source {:type :query :query query}
                                                         :target (assoc target :database (mt/id))}]
                (with-redefs [metabot.self/llm-call-unavailable-reason (constantly nil)
                              llm/evaluate-prompt
                              (fn [text output]
                                (swap! calls conj [text (:base-type output) (:json-text? output)])
                                (case text
                                  "same"     (if (= :type/BigInteger (:base-type output)) 7 "seven")
                                  "flag"     true
                                  "on"       "2024-01-15"
                                  "extract"  {(keyword "Customer Name") "Acme"}
                                  "mismatch" "not-a-number"
                                  nil))]
                  (transforms.execute/execute! transform {:run-method :manual
                                                          :user-id     (mt/user->id :crowberto)}))
                (transforms.tu/wait-for-table table-name 10000)
                (testing "the same prompt text with different schemas is evaluated twice"
                  (is (= 2 (count (filter (fn [[text]] (= text "same")) @calls)))))
                (testing "column types follow the output spec"
                  (is (= :type/BigInteger (:base_type (field-by-name table-name "Score"))))
                  (is (= :type/Boolean (:base_type (field-by-name table-name "Flag"))))
                  (is (= :type/Date (:base_type (field-by-name table-name "On"))))
                  (is (= :type/Text (:base_type (field-by-name table-name "Extracted")))))
                (let [rows (transforms.tu/table-rows table-name)]
                  (is (seq rows))
                  (testing "typed values are written"
                    (is (some (fn [row] (some #{7} row)) rows))
                    (is (some (fn [row] (some #{true} row)) rows)))
                  (testing "object answers keep keys with spaces"
                    (is (some (fn [row]
                                (some (fn [v]
                                        (and (string? v) (re-find #"Customer Name" v)))
                                      row))
                              rows)))
                  (testing "a type mismatch is written as NULL"
                    (let [table  (t2/select-one :model/Table :db_id (mt/id) :name table-name :active true)
                          bad-id (:id (field-by-name table-name "Bad"))
                          vals   (map first
                                      (mt/rows (mt/process-query
                                                {:database (mt/id)
                                                 :type     :query
                                                 :query    {:source-table (:id table)
                                                            :fields       [[:field bad-id nil]]}})))]
                      (is (every? nil? vals)))))))))))))

(deftest coerce-answer-test
  (testing "Text json-text? encodes maps so keys with spaces survive"
    (is (= (json/encode {(keyword "Customer Name") "Acme"})
           (#'runner/coerce-answer {:base-type :type/Text :json-text? true}
                                   {(keyword "Customer Name") "Acme"}))))
  (testing "BigInteger accepts integers, integral doubles, and numeric strings"
    (is (= 7 (#'runner/coerce-answer {:base-type :type/BigInteger} 7)))
    (is (= 7 (#'runner/coerce-answer {:base-type :type/BigInteger} 7.0)))
    (is (= 7 (#'runner/coerce-answer {:base-type :type/BigInteger} "7")))
    (is (nil? (#'runner/coerce-answer {:base-type :type/BigInteger} "nope"))))
  (testing "Boolean accepts booleans and true/false strings"
    (is (true? (#'runner/coerce-answer {:base-type :type/Boolean} true)))
    (is (false? (#'runner/coerce-answer {:base-type :type/Boolean} "false")))
    (is (nil? (#'runner/coerce-answer {:base-type :type/Boolean} "yes"))))
  (testing "Date and DateTime parse ISO strings"
    (is (some? (#'runner/coerce-answer {:base-type :type/Date} "2024-01-15")))
    (is (some? (#'runner/coerce-answer {:base-type :type/DateTime} "2024-01-15T10:30:00")))
    (is (some? (#'runner/coerce-answer {:base-type :type/DateTime} "2024-01-15T10:30:00Z")))
    (is (nil? (#'runner/coerce-answer {:base-type :type/Date} "not-a-date")))))

(ns metabase.lib.prompt-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.prompt :as lib.prompt]
   [metabase.lib.schema.expression.string :as lib.schema.expression.string]))

(deftest ^:parallel return-type-coverage-test
  (is (= lib.schema.expression.string/prompt-return-types
         (set (keys lib.prompt/return-type->output)))))

(deftest ^:parallel prompt-output-test
  (testing "returnType values"
    (doseq [[return-type expected] lib.prompt/return-type->output]
      (is (= expected (lib/prompt-output {:return-type return-type})))))
  (testing "the default is text"
    (is (= (lib.prompt/return-type->output :text)
           (lib/prompt-output {}))))
  (testing "jsonSchema root rules"
    (is (= {:json-schema {"type" "integer"} :base-type :type/BigInteger :json-text? false}
           (lib/prompt-output {:json-schema "{\"type\": \"integer\"}"})))
    (is (= {:json-schema {"type" "number"} :base-type :type/Float :json-text? false}
           (lib/prompt-output {:json-schema "{\"type\": \"number\"}"})))
    (is (= {:json-schema {"type" "boolean"} :base-type :type/Boolean :json-text? false}
           (lib/prompt-output {:json-schema "{\"type\": \"boolean\"}"})))
    (is (= {:json-schema {"type" "string"} :base-type :type/Text :json-text? false}
           (lib/prompt-output {:json-schema "{\"type\": \"string\"}"})))
    (is (= :type/Date
           (:base-type (lib/prompt-output {:json-schema "{\"type\": \"string\", \"format\": \"date\"}"}))))
    (is (= :type/DateTime
           (:base-type (lib/prompt-output {:json-schema "{\"type\": \"string\", \"format\": \"date-time\"}"}))))
    (is (= {:json-schema {"enum" ["positive" "neutral" "negative"]}
            :base-type   :type/Text
            :json-text?  false}
           (lib/prompt-output {:json-schema "{\"enum\": [\"positive\", \"neutral\", \"negative\"]}"})))
    (is (true? (:json-text? (lib/prompt-output {:json-schema "{\"type\": \"object\"}"}))))
    (is (true? (:json-text? (lib/prompt-output {:json-schema "{\"type\": \"array\"}"}))))
    (is (true? (:json-text? (lib/prompt-output {:json-schema "{}"}))))
    (is (true? (:json-text? (lib/prompt-output {:json-schema "{\"enum\": [1, \"x\"]}"})))))
  (testing "errors"
    (is (= {:error "Use returnType or jsonSchema, not both"}
           (lib/prompt-output {:return-type :integer :json-schema "{\"type\": \"integer\"}"})))
    (is (= {:error "jsonSchema must be valid JSON"}
           (lib/prompt-output {:json-schema "not-json"})))
    (is (= {:error "jsonSchema must be a JSON object, like {\"type\": \"integer\"}"}
           (lib/prompt-output {:json-schema "\"hello\""})))))

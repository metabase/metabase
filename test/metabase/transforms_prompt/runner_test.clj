(ns ^:mb/driver-tests metabase.transforms-prompt.runner-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.self :as metabot.self]
   [metabase.test :as mt]
   [metabase.transforms-prompt.llm :as llm]
   [metabase.transforms.execute :as transforms.execute]
   [metabase.transforms.test-dataset :as transforms-dataset]
   [metabase.transforms.test-util :as transforms.tu :refer [with-transform-cleanup!]]
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
                              llm/evaluate-prompt (fn [text]
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

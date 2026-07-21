(ns metabase-enterprise.data-complexity-score.complexity-embedders-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase-enterprise.data-complexity-score.complexity-embedders :as embedders]))

(deftest ^:sequential in-process-minilm-integration-test
  (if-not (or (io/resource "metabase-embedder/all-MiniLM-L6-v2-arm64.zip")
              (io/resource "metabase-embedder/all-MiniLM-L6-v2-avx2.zip"))
    (testing "MiniLM bundle unavailable outside the embedder CI job"
      (is true))
    (let [embedder (embedders/provider-embedder {:provider         "in-process"
                                                 :model-name       "all-MiniLM-L6-v2"
                                                 :model-dimensions 384})
          vectors  (embedder [{:name "monthlyActiveUsers"}
                              {:name "orders"}])]
      (is (= #{"monthlyactiveusers" "orders"} (set (keys vectors))))
      (is (every? #(= 384 (alength ^floats %)) (vals vectors))))))

(deftest ^:parallel split-for-embedding-test
  (testing "nil-safe"
    (is (nil? (embedders/split-for-embedding nil))))
  (testing "_, -, and . separators become spaces; output is lowercased"
    (is (= "monthly active users" (embedders/split-for-embedding "monthly_active_users")))
    (is (= "monthly active users" (embedders/split-for-embedding "monthly-active-users")))
    (is (= "monthly active users" (embedders/split-for-embedding "monthly.active.users")))
    (is (= "monthly active users report" (embedders/split-for-embedding "monthly_active-users.report"))
        "mixed separators collapse together"))
  (testing "adjacent whitespace collapses and the result is trimmed"
    (is (= "monthly active users" (embedders/split-for-embedding "  monthly   active\tusers  "))))
  (testing "camelCase splits at lower→upper boundaries only, so all-caps runs stay joined"
    (is (= "page views" (embedders/split-for-embedding "pageViews")))
    (is (= "monthly active users" (embedders/split-for-embedding "monthlyActiveUsers")))
    (is (= "maucount" (embedders/split-for-embedding "MAUcount")))
    (is (= "mau count" (embedders/split-for-embedding "mauCount")))))

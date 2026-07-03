(ns metabase-enterprise.data-complexity-score.complexity-embedders-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-complexity-score.complexity-embedders :as embedders]))

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

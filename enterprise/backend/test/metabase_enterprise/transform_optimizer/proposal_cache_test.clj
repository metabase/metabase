(ns metabase-enterprise.transform-optimizer.proposal-cache-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.transform-optimizer.proposal-cache :as cache]))

(set! *warn-on-reflection* true)

#_{:clj-kondo/ignore [:metabase/validate-deftest]}
(use-fixtures :each (fn [t] (#'cache/clear-all!) (t) (#'cache/clear-all!)))

(deftest ^:synchronized put-and-get-roundtrip-test
  (testing "stored proposals are retrievable by user+transform+id"
    (cache/put-all! 1 99 [{:id "p1" :body "SELECT 1"}
                          {:id "p2" :body "SELECT 2"}])
    (is (= {:id "p1" :body "SELECT 1"}
           (cache/get-one 1 99 "p1")))
    (is (= {:id "p2" :body "SELECT 2"}
           (cache/get-one 1 99 "p2")))))

(deftest ^:synchronized get-missing-returns-nil-test
  (testing "missing id returns nil rather than throwing"
    (cache/put-all! 1 99 [{:id "p1"}])
    (is (nil? (cache/get-one 1 99 "p2")))))

(deftest ^:synchronized skips-blank-ids-test
  (testing "skips proposals with blank/nil ids"
    (cache/put-all! 1 99 [{:id nil :body "x"} {:id "" :body "y"} {:id "p3"}])
    (is (nil? (cache/get-one 1 99 nil)))
    (is (nil? (cache/get-one 1 99 "")))
    (is (= {:id "p3"} (cache/get-one 1 99 "p3")))))

(deftest ^:synchronized user-isolation-test
  (testing "user A cannot read proposals stored for user B"
    (cache/put-all! 1 99 [{:id "p1" :body "SECRET"}])
    (is (nil? (cache/get-one 2 99 "p1"))
        "different user-id must not see the proposal")
    (is (some? (cache/get-one 1 99 "p1"))
        "owner still sees it")))

(deftest ^:synchronized transform-isolation-test
  (testing "proposal stored for transform A is not visible under transform B"
    (cache/put-all! 1 99 [{:id "p1"}])
    (is (nil? (cache/get-one 1 100 "p1")))
    (is (some? (cache/get-one 1 99 "p1")))))

;; Split into separate deftests so the :each fixture clears the cache
;; between each scenario. `testing` blocks inside one deftest share state.

(deftest ^:synchronized get-many-mixed-test
  (testing "returns proposals in input order + reports missing"
    (cache/put-all! 1 99 [{:id "p1" :body "a"} {:id "p3" :body "c"}])
    (let [[found missing] (cache/get-many 1 99 ["p1" "p2" "p3" "p4"])]
      (is (= [{:id "p1" :body "a"} {:id "p3" :body "c"}] found))
      (is (= ["p2" "p4"] missing)))))

(deftest ^:synchronized get-many-all-present-test
  (testing "all present ⇒ no missing"
    (cache/put-all! 1 99 [{:id "p1"} {:id "p2"}])
    (let [[found missing] (cache/get-many 1 99 ["p1" "p2"])]
      (is (= 2 (count found)))
      (is (empty? missing)))))

(deftest ^:synchronized get-many-all-missing-test
  (testing "all missing ⇒ all reported as missing"
    (let [[found missing] (cache/get-many 1 99 ["p1" "p2"])]
      (is (empty? found))
      (is (= ["p1" "p2"] missing)))))

(deftest ^:synchronized re-put-overwrites-test
  (testing "calling put-all! again with the same id replaces the previous entry"
    (cache/put-all! 1 99 [{:id "p1" :body "v1"}])
    (cache/put-all! 1 99 [{:id "p1" :body "v2"}])
    (is (= "v2" (:body (cache/get-one 1 99 "p1"))))))

(deftest ^:synchronized empty-put-noop-test
  (testing "put-all! with empty proposals does nothing (no errors)"
    (cache/put-all! 1 99 [])
    (cache/put-all! 1 99 nil)
    (is (nil? (cache/get-one 1 99 "anything")))))

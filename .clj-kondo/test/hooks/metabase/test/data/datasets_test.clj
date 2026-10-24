(ns hooks.metabase.test.data.datasets-test
  (:require
   [clj-kondo.core :as clj-kondo]
   [clojure.test :refer :all]))

(defn- driver-test-findings! [ns-metadata forms]
  (with-in-str (str "(ns " ns-metadata " hooks.example-test
                     (:require [clojure.test :refer [deftest is]]
                               [metabase.test :as mt]))\n"
                    forms)
    (->> (clj-kondo/run! {:lint ["-"]})
         :findings
         (filter #(= :metabase/validate-mb-driver-tests (:type %))))))

(deftest ^:synchronized driver-test-tags-test
  (testing "the tag can be on the namespace or the test"
    (are [ns-metadata test-metadata]
         (empty? (driver-test-findings!
                  ns-metadata
                  (str "(deftest " test-metadata " example-test (mt/test-driver :sqlite (is true)))")))
      "^:mb/driver-tests" ""
      "" "^:mb/driver-tests"
      "" "^{:mb/driver-tests true}"))
  (testing "a test tag does not exempt a subsequent untagged test"
    (is (= 1 (count (driver-test-findings!
                     ""
                     "(deftest ^:mb/driver-tests tagged-test (mt/test-driver :sqlite (is true)))
                      (deftest untagged-test (mt/test-driver :sqlite (is true)))")))))
  (testing "an untagged or explicitly untagged test still needs the tag"
    (doseq [test-metadata ["" "^{:mb/driver-tests false}"]]
      (is (= 1 (count (driver-test-findings!
                       ""
                       (str "(deftest " test-metadata " example-test (mt/test-driver :sqlite (is true)))"))))))))

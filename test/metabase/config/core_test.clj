(ns metabase.config.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.config.core :as config]))

(deftest major-version-test
  (testing "parses standard version strings"
    (is (= 50 (config/major-version "v1.50.25")))
    (is (= 50 (config/major-version "v0.50.25")))
    (is (= 58 (config/major-version "v1.58.0"))))

  (testing "returns nil for unparseable versions"
    (is (nil? (config/major-version "vUNKNOWN")))
    (is (nil? (config/major-version "")))
    (is (nil? (config/major-version "not-a-version")))))

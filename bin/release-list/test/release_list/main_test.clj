(ns main-test
  (:require [clojure.test :refer [deftest is testing]]
            [release-list.main :as rl]))

(deftest test-build-link
  (testing "Builds correct link as a list item."
    (is (= (rl/build-link "v1.2.3")
           "- [v1.2.3](https://github.com/metabase/metabase/releases/tag/v1.2.3)"))))

(deftest test-semver-map
  (testing "Builds map with with semantic versioning info."
    (is (= (rl/semver-map "1.43.2.1")
           {:edition 1
            :major 43
            :point 2
            :hotfix 1}))
    (is (= (rl/semver-map "0.9-final")
           {:edition 0
            :major 9
            :point 0
            :hotfix 0}))))

(def release-link "- [v0.45.3](https://github.com/metabase/metabase/releases/tag/1.2.3)")

(deftest test-get-version
  (testing "Gets a line containing release information, and returns a map of release info for sorting."
    (is (= (rl/get-version release-link)
           {:edition 0
            :major 45
            :point 3
            :hotfix 0}))))


(def releases "Metabase v0.46.1 Latest  v0.46.1 about 21 days ago\nMetabase® Enterprise Edition™ v1.46.1 v1.46.1 about 21 days ago\nMetabase v0.45.3.1 v0.45.3.1 about 29 days ago\nMetabase® Enterprise Edition™ v1.45.3.1 v1.45.3.1 about 29 days ago")

(def release-list '("- [v1.46.1](https://github.com/metabase/metabase/releases/tag/v1.46.1)"
                    "- [v0.46.1](https://github.com/metabase/metabase/releases/tag/v0.46.1)"
                    "- [v1.45.3.1](https://github.com/metabase/metabase/releases/tag/v1.45.3.1)"
                    "- [v0.45.3.1](https://github.com/metabase/metabase/releases/tag/v0.45.3.1)"))

(deftest test-prep-links
  (testing "Creates links to GitHub release pages, and sorts by release and edition. EE before OSS."
    (is (= (rl/prep-links releases) release-list))))

(ns mage.docs-test
  (:require
   [clojure.test :as t :refer [are deftest is testing]]
   [mage.docs :as docs]))

(deftest base-path-for-branch-test
  (testing "release branches publish under /docs/v0.NN"
    (are [branch expected] (= expected (docs/base-path-for-branch branch))
      "release-x.55.x"   "/docs/v0.55"
      "release-x.60.x"   "/docs/v0.60"
      "release-x.100.x"  "/docs/v0.100"))

  (testing "non-release branches publish under /docs/latest"
    (are [branch] (= "/docs/latest" (docs/base-path-for-branch branch))
      "master"
      "main"
      "feature/some-feature"
      "docs-build"
      "release-x"            ; not a full match
      "release-55.x"         ; missing x. prefix
      "x-release-x.55.x"     ; trailing match not enough
      ""))

  (testing "nil branch (e.g. detached HEAD) falls back to /docs/latest"
    (is (= "/docs/latest" (docs/base-path-for-branch nil)))))

(deftest slugify-test
  (testing "slashes and special chars become dashes"
    (are [input expected] (= expected (docs/slugify input))
      "release-x.55.x"        "release-x.55.x"      ; already filesystem-safe
      "master"                "master"
      "feature/foo-bar"       "feature-foo-bar"
      "team/sub/branch"       "team-sub-branch"
      "weird name!"           "weird-name-"
      "tag@v1.0"              "tag-v1.0"
      "spaces in here"        "spaces-in-here"
      "preserve_underscores"  "preserve_underscores"
      "preserve.dots"         "preserve.dots")))

(deftest base-tail-test
  (testing "extracts the last path segment"
    (are [base-path expected] (= expected (docs/base-tail base-path))
      "/docs/v0.55"   "v0.55"
      "/docs/v0.100"  "v0.100"
      "/docs/latest"  "latest"
      "/docs/master"  "master"))

  (testing "no leading slash works too"
    (is (= "latest" (docs/base-tail "docs/latest")))))

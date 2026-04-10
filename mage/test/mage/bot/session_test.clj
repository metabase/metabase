(ns mage.bot.session-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [mage.bot.session :as session]))

(set! *warn-on-reflection* true)

(def ^:private parse-wt-name #'session/parse-worktree-name)

(deftest branch-to-session-name-test
  (testing "strips remote prefix"
    (is (= "qabot-my-branch" (session/branch-to-session-name "qabot" "feature/my-branch"))))
  (testing "lowercases"
    (is (= "fixbot-mb-12345-fix" (session/branch-to-session-name "fixbot" "MB-12345-Fix"))))
  (testing "replaces special chars with hyphens"
    (is (= "uxbot-foo-bar-baz" (session/branch-to-session-name "uxbot" "foo_bar.baz"))))
  (testing "deduplicates hyphens"
    (is (= "qabot-a-b" (session/branch-to-session-name "qabot" "a--b"))))
  (testing "strips leading/trailing hyphens"
    (is (= "qabot-abc" (session/branch-to-session-name "qabot" "-abc-"))))
  (testing "truncates to 40 chars"
    (let [long-branch (apply str (repeat 50 "a"))
          result (session/branch-to-session-name "qabot" long-branch)]
      (is (<= (count result) (+ 6 40)))))) ;; "qabot-" + 40

(deftest parse-worktree-name-test
  (testing "extracts name from __worktrees/ path"
    (is (= "fixbot-mb-123" (parse-wt-name "fixbot-mb-123  /path/__worktrees/fixbot-mb-123"))))
  (testing "returns nil for (here) marker"
    (is (nil? (parse-wt-name "main  /path/to/repo (here)"))))
  (testing "extracts last component for non-worktree paths"
    (is (= "some-dir" (parse-wt-name "some-dir  /path/to/some-dir")))))

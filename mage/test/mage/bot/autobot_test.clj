(ns mage.bot.autobot-test
  (:require
   [babashka.fs :as fs]
   [clojure.test :refer [deftest is testing]]
   [mage.bot.autobot :as autobot]))

(set! *warn-on-reflection* true)

(def ^:private parse-wt-name        #'autobot/parse-worktree-name)
(def ^:private launch-config-path   #'autobot/launch-config-path)
(def ^:private with-workmux-config! #'autobot/with-workmux-config!)

(deftest branch-to-session-name-test
  (testing "simple branch name"
    (is (= "stream-fingerprinting" (autobot/branch-to-session-name "stream-fingerprinting"))))
  (testing "replaces slashes with dashes"
    (is (= "feature-my-branch" (autobot/branch-to-session-name "feature/my-branch"))))
  (testing "lowercases"
    (is (= "mb-12345-fix" (autobot/branch-to-session-name "MB-12345-Fix"))))
  (testing "replaces special chars with hyphens"
    (is (= "foo-bar-baz" (autobot/branch-to-session-name "foo_bar.baz"))))
  (testing "deduplicates hyphens"
    (is (= "a-b" (autobot/branch-to-session-name "a--b"))))
  (testing "strips leading/trailing hyphens"
    (is (= "abc" (autobot/branch-to-session-name "-abc-"))))
  (testing "truncates to 40 chars"
    (let [long-branch (apply str (repeat 50 "a"))
          result (autobot/branch-to-session-name long-branch)]
      (is (<= (count result) 40)))))

(deftest parse-worktree-name-test
  (testing "extracts name from __worktrees/ path"
    (is (= "fixbot-mb-123" (parse-wt-name "fixbot-mb-123  /path/__worktrees/fixbot-mb-123"))))
  (testing "returns nil for (here) marker"
    (is (nil? (parse-wt-name "main  /path/to/repo (here)"))))
  (testing "extracts last component for non-worktree paths"
    (is (= "some-dir" (parse-wt-name "some-dir  /path/to/some-dir")))))

(deftest launch-config-path-test
  (testing "config goes under <root>/.bot/launch/<session>.yaml"
    (is (= "/some/root/.bot/launch/my-session.yaml"
           (launch-config-path "/some/root" "my-session")))))

(deftest with-workmux-config!-writes-and-cleans-up
  (let [dir         (str (fs/create-temp-dir))
        cfg-path    (str dir "/.bot/launch/test.yaml")
        cfg-content "agent: 'claude'\n"
        observed    (atom nil)]
    (try
      (testing "config file exists during invocation, gone afterward"
        (with-workmux-config! cfg-path cfg-content
          (fn []
            (reset! observed (slurp cfg-path))))
        (is (= cfg-content @observed))
        (is (not (.exists (java.io.File. cfg-path)))))

      (testing "config file is cleaned up even when f throws"
        (is (thrown? RuntimeException
                     (with-workmux-config! cfg-path cfg-content
                       (fn [] (throw (RuntimeException. "boom"))))))
        (is (not (.exists (java.io.File. cfg-path)))))

      (testing "parent directories are created on demand"
        (let [nested (str dir "/.bot/launch/deeper/dir/x.yaml")]
          (with-workmux-config! nested cfg-content (fn []))
          (is (not (.exists (java.io.File. nested))))))
      (finally
        (fs/delete-tree dir)))))

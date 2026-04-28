(ns mage.bot.autobot-test
  (:require
   [babashka.process :as p]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [mage.bot.autobot :as autobot]))

(set! *warn-on-reflection* true)

(def ^:private parse-wt-name #'autobot/parse-worktree-name)
(def ^:private shell-quote   #'autobot/shell-quote)
(def ^:private shell-join    #'autobot/shell-join)

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

;; The launch path in launch-workmux-session! pipes shell-joined argv into a
;; shell via `tmux send-keys -l`. If shell-quote leaks an unescaped metachar,
;; user-controlled values (e.g. branch names) become a command-injection sink.
;; These tests pin down the contract: every input round-trips back to itself
;; when re-parsed by /bin/sh.

(defn- sh-roundtrip
  "Pass `<quoted-cmd>` to /bin/sh as the body of a function that prints each
   positional arg on its own line. Returns the parsed argv as the shell sees it."
  [argv]
  (let [script (str "f() { for a in \"$@\"; do printf '%s\\n' \"ARG=$a\"; done; }; f " (shell-join argv))
        {:keys [out exit]} @(p/process ["sh" "-c" script] {:out :string})]
    (when (zero? exit)
      (->> (str/split-lines out)
           (keep #(when (str/starts-with? % "ARG=") (subs % 4)))
           vec))))

(deftest shell-join-injection-test
  (testing "ordinary args round-trip"
    (is (= ["workmux" "add" "feature-branch"]
           (sh-roundtrip ["workmux" "add" "feature-branch"]))))
  (testing "single quotes don't break the quoting"
    (is (= ["it's a branch"] (sh-roundtrip ["it's a branch"]))))
  (testing "command substitution is neutralized"
    (is (= ["$(rm -rf /)"] (sh-roundtrip ["$(rm -rf /)"])))
    (is (= ["`whoami`"] (sh-roundtrip ["`whoami`"]))))
  (testing "double quotes, semicolons, and pipes are inert"
    (is (= ["a\"b" "c;d" "e|f" "g&h"]
           (sh-roundtrip ["a\"b" "c;d" "e|f" "g&h"]))))
  (testing "shell-quote wraps in single quotes"
    (is (= "'plain'" (shell-quote "plain")))
    (is (= "'a'\\''b'" (shell-quote "a'b")))))

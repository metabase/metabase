(ns mage.bot.git-readonly-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [mage.bot.git-readonly]))

(set! *warn-on-reflection* true)

(def ^:private git-readonly? #'mage.bot.git-readonly/git-subcommand-readonly?)
(def ^:private gh-readonly?  #'mage.bot.git-readonly/gh-command-readonly?)
(def ^:private gh-api-ro?    #'mage.bot.git-readonly/gh-api-readonly?)
(def ^:private parse-args     #'mage.bot.git-readonly/parse-git-args)

(deftest git-always-readonly-subcommands
  (testing "Unconditionally read-only subcommands"
    (doseq [cmd ["blame" "diff" "log" "status" "show" "rev-parse" "ls-files" "ls-tree"
                 "merge-base" "describe" "shortlog" "show-ref" "cat-file" "version"]]
      (is (true? (git-readonly? cmd [])) (str cmd " should be read-only")))))

(deftest git-always-write-subcommands
  (testing "Unconditionally write subcommands"
    (doseq [cmd ["commit" "push" "pull" "reset" "checkout" "merge" "rebase" "add" "rm"
                 "cherry-pick" "revert" "clean" "switch" "restore" "mv"]]
      (is (false? (git-readonly? cmd [])) (str cmd " should be blocked")))))

(deftest git-fetch-is-allowed
  (is (true? (git-readonly? "fetch" []))))

(deftest git-branch-conditional
  (testing "branch with no flags is read-only (listing)"
    (is (true? (git-readonly? "branch" [])))
    (is (true? (git-readonly? "branch" ["-a"])))
    (is (true? (git-readonly? "branch" ["-v"]))))
  (testing "branch with write flags is blocked"
    (is (false? (git-readonly? "branch" ["-D" "my-branch"])))
    (is (false? (git-readonly? "branch" ["-d" "my-branch"])))
    (is (false? (git-readonly? "branch" ["-m" "old" "new"])))
    (is (false? (git-readonly? "branch" ["--delete" "my-branch"])))
    (is (false? (git-readonly? "branch" ["--move" "old" "new"])))))

(deftest git-tag-conditional
  (testing "tag with no args is read-only (listing)"
    (is (true? (git-readonly? "tag" [])))
    (is (true? (git-readonly? "tag" ["-l"])))
    (is (true? (git-readonly? "tag" ["-l" "v*"]))))
  (testing "tag with delete/force is blocked"
    (is (false? (git-readonly? "tag" ["-d" "v1.0"])))
    (is (false? (git-readonly? "tag" ["--delete" "v1.0"])))
    (is (false? (git-readonly? "tag" ["-f" "v1.0"])))))

(deftest git-stash-conditional
  (testing "stash list and show are read-only"
    (is (true? (git-readonly? "stash" ["list"])))
    (is (true? (git-readonly? "stash" ["show"]))))
  (testing "stash with no subcommand defaults to list (read-only)"
    (is (true? (git-readonly? "stash" [])))))

(deftest git-config-conditional
  (testing "config read operations"
    (is (true? (git-readonly? "config" ["--get" "user.name"])))
    (is (true? (git-readonly? "config" ["--list"]))))
  (testing "config write operations are blocked"
    (is (false? (git-readonly? "config" ["--set" "user.name" "test"])))
    (is (false? (git-readonly? "config" ["--unset" "user.name"])))
    (is (false? (git-readonly? "config" ["--edit"])))))

(deftest git-remote-conditional
  (testing "remote read operations"
    (is (true? (git-readonly? "remote" ["show" "origin"])))
    (is (true? (git-readonly? "remote" ["get-url" "origin"]))))
  (testing "remote write operations are blocked"
    (is (false? (git-readonly? "remote" ["add" "upstream" "url"])))
    (is (false? (git-readonly? "remote" ["remove" "origin"])))
    (is (false? (git-readonly? "remote" ["rename" "old" "new"])))))

(deftest git-unknown-subcommands-are-blocked
  (is (false? (git-readonly? "unknown-command" []))))

(deftest gh-command-classification
  (testing "read-only gh commands"
    (is (true? (gh-readonly? ["pr" "view"])))
    (is (true? (gh-readonly? ["pr" "list"])))
    (is (true? (gh-readonly? ["pr" "diff"])))
    (is (true? (gh-readonly? ["issue" "view"])))
    (is (true? (gh-readonly? ["issue" "list"])))
    (is (true? (gh-readonly? ["repo" "view"])))
    (is (true? (gh-readonly? ["run" "list"]))))
  (testing "write gh commands"
    (is (false? (gh-readonly? ["pr" "create"])))
    (is (false? (gh-readonly? ["pr" "merge"])))
    (is (false? (gh-readonly? ["pr" "close"])))
    (is (false? (gh-readonly? ["issue" "create"])))
    (is (false? (gh-readonly? ["issue" "close"])))
    (is (false? (gh-readonly? ["repo" "delete"]))))
  (testing "unknown commands are blocked"
    (is (false? (gh-readonly? ["unknown" "thing"])))))

(deftest gh-api-method-detection
  (testing "default is GET (read-only)"
    (is (true? (gh-api-ro? ["/repos/metabase/metabase"]))))
  (testing "explicit GET is read-only"
    (is (true? (gh-api-ro? ["--method" "GET" "/repos"]))))
  (testing "POST is write"
    (is (false? (gh-api-ro? ["--method" "POST" "/repos"]))))
  (testing "-X shorthand"
    (is (false? (gh-api-ro? ["-X" "DELETE" "/repos"])))
    (is (true? (gh-api-ro? ["-X" "GET" "/repos"])))))

(deftest parse-git-args-skips-global-flags
  (testing "finds subcommand after -C"
    (is (= {:subcommand "log" :args ["--oneline"]}
           (parse-args ["-C" "/some/dir" "log" "--oneline"]))))
  (testing "finds subcommand after -c"
    (is (= {:subcommand "diff" :args []}
           (parse-args ["-c" "core.pager=cat" "diff"]))))
  (testing "finds subcommand after --git-dir="
    (is (= {:subcommand "status" :args []}
           (parse-args ["--git-dir=/path/.git" "status"]))))
  (testing "finds subcommand after --work-tree"
    (is (= {:subcommand "log" :args []}
           (parse-args ["--work-tree" "/path" "log"]))))
  (testing "simple subcommand"
    (is (= {:subcommand "log" :args ["--oneline" "-5"]}
           (parse-args ["log" "--oneline" "-5"])))))

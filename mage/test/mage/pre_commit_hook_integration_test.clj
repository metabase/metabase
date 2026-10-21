(ns mage.pre-commit-hook-integration-test
  "Integration tests for `.husky/pre-commit`.

   These tests are NOT run by `mage -test` because they create temporary git repositories and need bun and
   `node_modules` (lint-staged). Run manually with:
     bb -e '(require (quote mage.pre-commit-hook-integration-test)) (mage.pre-commit-hook-integration-test/run-tests)'

   lint-staged stashes your work as `lint-staged automatic backup` before running tasks. When lint-staged itself
   dies (e.g. bun or node crashes) after its reset, it never restores that backup. During a merge without
   partially staged files the hook skips the stash, so a crash cannot take the resolved conflicts with it."
  (:require
   [babashka.fs :as fs]
   [babashka.process :as p]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private hook-path
  (str (fs/path u/project-root-directory ".husky" "pre-commit")))

(def ^:private lint-staged-bin
  (str (fs/path u/project-root-directory "node_modules" ".bin" "lint-staged")))

;; Kills lint-staged when it restores its backup stash, after it has reset the work tree, as if bun or node crashed.
(defn- crashing-git-script []
  (str "#!/bin/sh
case \" $* \" in *\" stash apply \"*) kill -KILL $PPID; sleep 5 ;; esac
exec " (fs/which "git") " \"$@\"
"))

(defn- sh [dir & args]
  (let [result (p/sh (vec args) {:dir dir :err :string :out :string})]
    (when (not= 0 (:exit result))
      (throw (ex-info (str "Command failed: " (str/join " " args))
                      {:args args
                       :exit (:exit result)
                       :out (:out result)
                       :err (:err result)})))
    (:out result)))

(defn- run-hook [dir]
  (p/sh ["sh" "-e" hook-path] {:dir dir
                               :err :string
                               :out :string
                               :extra-env {"PATH" (str dir "/fake-bin:" (System/getenv "PATH"))}}))

(defn- setup-test-repo
  "Creates a repo in the middle of a merge: the conflict in `a.txt` is resolved and staged, and `b.txt` is staged.
   With `partially-staged?`, `b.txt` also gets an unstaged line. The lint-staged task for `*.txt` runs `task`.
   With `crash-on-restore?`, the hook runs with a `git` that kills lint-staged when it restores its backup stash.

   Returns the path to the temp directory."
  [{:keys [task partially-staged? crash-on-restore?]}]
  (let [tmp-dir (str (fs/create-temp-dir {:prefix "pre-commit-hook-test-"}))]
    (sh tmp-dir "git" "init" "-b" "master")
    (sh tmp-dir "git" "config" "user.email" "test@test.com")
    (sh tmp-dir "git" "config" "user.name" "Test User")
    (spit (str tmp-dir "/package.json") (str "{\"scripts\": {\"precommit\": \"" lint-staged-bin "\"}}\n"))
    (spit (str tmp-dir "/lint-staged.config.cjs") (str "module.exports = { \"*.txt\": [\"" task "\"] };\n"))
    (when crash-on-restore?
      (fs/create-dirs (str tmp-dir "/fake-bin"))
      (spit (str tmp-dir "/fake-bin/git") (crashing-git-script))
      (fs/set-posix-file-permissions (str tmp-dir "/fake-bin/git") "rwxr-xr-x"))
    (fs/create-sym-link (str tmp-dir "/hooks") (fs/path u/project-root-directory "hooks"))
    (spit (str tmp-dir "/a.txt") "base\n")
    (sh tmp-dir "git" "add" ".")
    (sh tmp-dir "git" "commit" "-m" "Initial commit")
    (sh tmp-dir "git" "checkout" "-b" "feature")
    (spit (str tmp-dir "/a.txt") "feature\n")
    (sh tmp-dir "git" "commit" "-am" "Feature")
    (sh tmp-dir "git" "checkout" "master")
    (spit (str tmp-dir "/a.txt") "master\n")
    (sh tmp-dir "git" "commit" "-am" "Master")
    (p/sh ["git" "merge" "feature"] {:dir tmp-dir})
    (spit (str tmp-dir "/a.txt") "resolved\n")
    (spit (str tmp-dir "/b.txt") "staged\n")
    (sh tmp-dir "git" "add" "a.txt" "b.txt")
    (when partially-staged?
      (spit (str tmp-dir "/b.txt") "staged\nunstaged\n"))
    tmp-dir))

(defn- assert-work-kept [tmp-dir partially-staged?]
  (is (= "resolved\n" (sh tmp-dir "git" "show" ":a.txt")) "resolved conflict stays staged")
  (is (= "resolved\n" (slurp (str tmp-dir "/a.txt"))) "resolved conflict stays in the working tree")
  (is (= "staged\n" (sh tmp-dir "git" "show" ":b.txt")) "staged change stays staged")
  (is (= (if partially-staged? "staged\nunstaged\n" "staged\n") (slurp (str tmp-dir "/b.txt")))
      "working tree keeps all changes")
  (is (fs/exists? (str tmp-dir "/.git/MERGE_HEAD")) "merge is still in progress"))

(defn- run-hook-in-merge [{:keys [partially-staged?] :as opts}]
  (let [tmp-dir (setup-test-repo opts)]
    (try
      (let [result (run-hook tmp-dir)]
        (assert-work-kept tmp-dir partially-staged?)
        result)
      (finally
        (fs/delete-tree tmp-dir)))))

(deftest lint-staged-crash-keeps-work-test
  (testing "When lint-staged crashes while reverting a failed lint during a merge, the hook fails and all work is kept"
    (is (not= 0 (:exit (run-hook-in-merge {:task "false" :crash-on-restore? true}))) "hook blocks the commit")))

(deftest lint-task-failure-keeps-work-test
  (doseq [partially-staged? [false true]]
    (testing (str "When a lint task fails during a merge, the hook fails and all work is kept"
                  (when partially-staged? ", including unstaged lines of a partially staged file"))
      (is (not= 0 (:exit (run-hook-in-merge {:task "false" :partially-staged? partially-staged?})))
          "hook blocks the commit"))))

(deftest lint-staged-success-keeps-work-test
  (doseq [partially-staged? [false true]]
    (testing (str "When lint-staged passes during a merge, the hook succeeds and all work is kept"
                  (when partially-staged? ", including unstaged lines of a partially staged file"))
      (let [result (run-hook-in-merge {:task "true" :partially-staged? partially-staged?})]
        (is (= 0 (:exit result)) (str "hook allows the commit. Output:\n" (:out result) (:err result)))))))

(defn run-tests
  "Run the integration tests. Call this manually since these tests
   are not included in the standard test suite."
  []
  (println "Running pre-commit hook integration tests...")
  (let [results (clojure.test/run-tests 'mage.pre-commit-hook-integration-test)]
    (if (and (zero? (:fail results)) (zero? (:error results)))
      (println "✓ All integration tests passed!")
      (println "✗ Some tests failed"))
    results))

(comment
  ;; Run tests manually:
  (run-tests)

  ;; Or from command line:
  ;; bb -e '(require (quote mage.pre-commit-hook-integration-test)) (mage.pre-commit-hook-integration-test/run-tests)'
  )

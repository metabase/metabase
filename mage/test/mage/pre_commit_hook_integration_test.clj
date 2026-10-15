(ns mage.pre-commit-hook-integration-test
  "Integration tests for `.husky/pre-commit`.

   These tests are NOT run by `mage -test` because they create temporary git repositories and need bun and
   `node_modules` (lint-staged). Run manually with:
     bb -e '(require (quote mage.pre-commit-hook-integration-test)) (mage.pre-commit-hook-integration-test/run-tests)'

   lint-staged stashes your work as `lint-staged automatic backup` before running tasks. When lint-staged itself
   dies (e.g. bun or node crashes), it never restores that backup, and the commit attempt loses unstaged changes."
  (:require
   [babashka.fs :as fs]
   [babashka.process :as p]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [mage.util :as u]))

(def ^:private hook-path
  (str (fs/path u/project-root-directory ".husky" "pre-commit")))

(def ^:private lint-staged-bin
  (str (fs/path u/project-root-directory "node_modules" ".bin" "lint-staged")))

;; Kills lint-staged mid-run, as if bun or node crashed.
(def ^:private crash-script
  "#!/bin/sh
kill -KILL $PPID
sleep 5
")

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
  (let [tmp-dir (fs/create-temp-dir {:prefix "pre-commit-hook-tmp-"})]
    (try
      (let [result (p/sh ["sh" "-e" hook-path] {:dir dir
                                                :err :string
                                                :out :string
                                                :extra-env {"TMPDIR" (str tmp-dir)}})]
        (assoc result :temporary-files (->> (fs/list-dir tmp-dir)
                                            (filter #(str/starts-with? (str (fs/file-name %)) "tmp."))
                                            (mapv str))))
      (finally
        (fs/delete-tree tmp-dir)))))

(defn- setup-test-repo
  "Creates a repo in the middle of a merge: the conflict in `a.txt` is resolved and staged, and `b.txt` is staged
   with an extra unstaged line. The lint-staged task for `*.txt` runs `task`.

   Returns the path to the temp directory."
  [task]
  (let [tmp-dir (str (fs/create-temp-dir {:prefix "pre-commit-hook-test-"}))]
    (sh tmp-dir "git" "init" "-b" "master")
    (sh tmp-dir "git" "config" "user.email" "test@test.com")
    (sh tmp-dir "git" "config" "user.name" "Test User")
    (spit (str tmp-dir "/package.json") (str "{\"scripts\": {\"precommit\": \"" lint-staged-bin "\"}}\n"))
    (spit (str tmp-dir "/lint-staged.config.cjs") (str "module.exports = { \"*.txt\": [\"" task "\"] };\n"))
    (spit (str tmp-dir "/crash.sh") crash-script)
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
    (spit (str tmp-dir "/b.txt") "staged\nunstaged\n")
    tmp-dir))

(defn- assert-work-kept [tmp-dir]
  (is (= "resolved\n" (sh tmp-dir "git" "show" ":a.txt")) "resolved conflict stays staged")
  (is (= "staged\n" (sh tmp-dir "git" "show" ":b.txt")) "staged change stays staged")
  (is (= "staged\nunstaged\n" (slurp (str tmp-dir "/b.txt"))) "unstaged change stays in the working tree")
  (is (fs/exists? (str tmp-dir "/.git/MERGE_HEAD")) "merge is still in progress"))

(deftest lint-staged-crash-keeps-work-test
  (testing "When lint-staged is killed mid-run during a merge, the hook fails and all work is kept"
    (let [tmp-dir (setup-test-repo "sh ./crash.sh")]
      (try
        (let [result (run-hook tmp-dir)
              stash-hash (str/trim (sh tmp-dir "git" "rev-parse" "refs/stash"))]
          (is (not= 0 (:exit result)) "hook blocks the commit")
          (is (str/includes? (:out result) stash-hash) "hook reports the retained safety backup hash")
          (is (empty? (:temporary-files result)) "hook removes its temporary merge-state backup"))
        (assert-work-kept tmp-dir)
        (is (= ["lint-staged automatic backup"]
               (str/split-lines (sh tmp-dir "git" "stash" "list" "--format=%gs")))
            "lint-staged backup is retained as a safety copy")
        (finally
          (fs/delete-tree tmp-dir))))))

(deftest lint-staged-success-keeps-work-test
  (testing "When lint-staged passes, the hook succeeds and all work is kept"
    (let [tmp-dir (setup-test-repo "true")]
      (try
        (let [result (run-hook tmp-dir)]
          (is (= 0 (:exit result)) (str "hook allows the commit. Output:\n" (:out result) (:err result)))
          (is (empty? (:temporary-files result)) "hook removes its temporary merge-state backup"))
        (assert-work-kept tmp-dir)
        (finally
          (fs/delete-tree tmp-dir))))))

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

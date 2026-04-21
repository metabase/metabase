(ns mage.merge-yaml-migrations-integration-test
  "Integration tests for the YAML merge driver during git rebase scenarios.

   These tests are NOT run by `mage -test` because they require creating
   temporary git repositories and branches. Run manually with:
     bb -e '(require (quote mage.merge-yaml-migrations-integration-test)) (mage.merge-yaml-migrations-integration-test/run-tests)'

   This tests the root cause of migrations being dropped during rebase:
   Git passes the WRONG 'ours' file on 2nd+ merge driver calls.

   Scenario:
   Feature branch has commits: A → B → C (each touches migrations.yaml)

   During rebase onto master:
   - Cherry-pick A: base=merge-base, ours=master, theirs=A → correct
   - Cherry-pick B: base=A, ours=master (WRONG!), theirs=B → loses A's migrations
   - Cherry-pick C: base=B, ours=master (WRONG!), theirs=C → loses A+B's migrations"
  (:require
   [babashka.fs :as fs]
   [babashka.process :as p]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]))

(def ^:private base-yaml
  "databaseChangeLog:
  - objectQuotingStrategy: QUOTE_ALL_OBJECTS

  - changeSet:
      id: v58.2025-01-01T00:00:00
      author: base
      changes:
        - sql:
            sql: SELECT 1

# >>>>>>>>>> DO NOT ADD NEW MIGRATIONS BELOW THIS LINE! ADD THEM ABOVE <<<<<<<<<<
")

(def ^:private commit-a-yaml
  "databaseChangeLog:
  - objectQuotingStrategy: QUOTE_ALL_OBJECTS

  - changeSet:
      id: v58.2025-01-01T00:00:00
      author: base
      changes:
        - sql:
            sql: SELECT 1

  - changeSet:
      id: v58.2025-01-02T00:00:00
      author: commit-a
      changes:
        - sql:
            sql: SELECT 'from commit A'

# >>>>>>>>>> DO NOT ADD NEW MIGRATIONS BELOW THIS LINE! ADD THEM ABOVE <<<<<<<<<<
")

(def ^:private commit-b-yaml
  "databaseChangeLog:
  - objectQuotingStrategy: QUOTE_ALL_OBJECTS

  - changeSet:
      id: v58.2025-01-01T00:00:00
      author: base
      changes:
        - sql:
            sql: SELECT 1

  - changeSet:
      id: v58.2025-01-02T00:00:00
      author: commit-a
      changes:
        - sql:
            sql: SELECT 'from commit A'

  - changeSet:
      id: v58.2025-01-03T00:00:00
      author: commit-b
      changes:
        - sql:
            sql: SELECT 'from commit B'

# >>>>>>>>>> DO NOT ADD NEW MIGRATIONS BELOW THIS LINE! ADD THEM ABOVE <<<<<<<<<<
")

(def ^:private commit-c-yaml
  "databaseChangeLog:
  - objectQuotingStrategy: QUOTE_ALL_OBJECTS

  - changeSet:
      id: v58.2025-01-01T00:00:00
      author: base
      changes:
        - sql:
            sql: SELECT 1

  - changeSet:
      id: v58.2025-01-02T00:00:00
      author: commit-a
      changes:
        - sql:
            sql: SELECT 'from commit A'

  - changeSet:
      id: v58.2025-01-03T00:00:00
      author: commit-b
      changes:
        - sql:
            sql: SELECT 'from commit B'

  - changeSet:
      id: v58.2025-01-04T00:00:00
      author: commit-c
      changes:
        - sql:
            sql: SELECT 'from commit C'

# >>>>>>>>>> DO NOT ADD NEW MIGRATIONS BELOW THIS LINE! ADD THEM ABOVE <<<<<<<<<<
")

(def ^:private master-new-yaml
  "databaseChangeLog:
  - objectQuotingStrategy: QUOTE_ALL_OBJECTS

  - changeSet:
      id: v58.2025-01-01T00:00:00
      author: base
      changes:
        - sql:
            sql: SELECT 1

  - changeSet:
      id: v58.2025-01-05T00:00:00
      author: master-new
      changes:
        - sql:
            sql: SELECT 'from master after branch'

# >>>>>>>>>> DO NOT ADD NEW MIGRATIONS BELOW THIS LINE! ADD THEM ABOVE <<<<<<<<<<
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

(defn- sh-ok? [dir & args]
  (let [result (p/sh (vec args) {:dir dir :err :string :out :string})]
    (= 0 (:exit result))))

(defn- count-changesets [content]
  (count (re-seq #"id: v58\." content)))

(defn- setup-test-repo
  "Creates a test repository with the problematic rebase scenario.

   Returns the path to the temp directory."
  []
  (let [tmp-dir (str (fs/create-temp-dir {:prefix "yaml-merge-test-"}))
        migrations-file "migrations.yaml"
        mage-path (str (fs/absolutize "."))]

    ;; Initialize repo
    (sh tmp-dir "git" "init")
    (sh tmp-dir "git" "config" "user.email" "test@test.com")
    (sh tmp-dir "git" "config" "user.name" "Test User")

    ;; Create a wrapper script that sets MB_DIR to the original PWD
    ;; This allows mage to resolve relative paths correctly
    (let [wrapper-path (str tmp-dir "/merge-wrapper.sh")]
      (spit wrapper-path
            (str "#!/bin/bash\n"
                 "# Set MB_DIR to preserve original working directory\n"
                 "export MB_DIR=\"$PWD\"\n"
                 mage-path "/bin/mage -merge-yaml-migrations \"$@\"\n"))
      (sh tmp-dir "chmod" "+x" wrapper-path)

      ;; Configure merge driver to use the wrapper
      (spit (str tmp-dir "/.gitattributes")
            (str migrations-file " merge=yaml-migrations\n"))
      (sh tmp-dir "git" "config" "merge.yaml-migrations.name" "YAML Migrations Merge Driver")
      (sh tmp-dir "git" "config" "merge.yaml-migrations.driver"
          (str wrapper-path " %O %A %B %L %P")))

    ;; Create initial commit on master with base yaml
    (spit (str tmp-dir "/" migrations-file) base-yaml)
    (sh tmp-dir "git" "add" ".")
    (sh tmp-dir "git" "commit" "-m" "Initial commit")

    ;; Create feature branch
    (sh tmp-dir "git" "checkout" "-b" "feature")

    ;; Commit A - add migration
    (spit (str tmp-dir "/" migrations-file) commit-a-yaml)
    (sh tmp-dir "git" "add" ".")
    (sh tmp-dir "git" "commit" "-m" "Commit A: add migration 01-02")

    ;; Commit B - add another migration
    (spit (str tmp-dir "/" migrations-file) commit-b-yaml)
    (sh tmp-dir "git" "add" ".")
    (sh tmp-dir "git" "commit" "-m" "Commit B: add migration 01-03")

    ;; Commit C - add another migration
    (spit (str tmp-dir "/" migrations-file) commit-c-yaml)
    (sh tmp-dir "git" "add" ".")
    (sh tmp-dir "git" "commit" "-m" "Commit C: add migration 01-04")

    ;; Go back to master and add a new migration there
    (sh tmp-dir "git" "checkout" "master")
    (spit (str tmp-dir "/" migrations-file) master-new-yaml)
    (sh tmp-dir "git" "add" ".")
    (sh tmp-dir "git" "commit" "-m" "Master: add migration 01-05")

    tmp-dir))

(deftest rebase-preserves-all-migrations-test
  (testing "Rebasing feature branch with multiple commits preserves all migrations"
    (let [tmp-dir (setup-test-repo)
          migrations-file "migrations.yaml"]
      (try
        ;; Checkout feature branch
        (sh tmp-dir "git" "checkout" "feature")

        ;; Count changesets before rebase (should be 4: base + A + B + C)
        (let [before-content (slurp (str tmp-dir "/" migrations-file))
              before-count (count-changesets before-content)]
          (is (= 4 before-count) "Feature branch should have 4 changesets before rebase"))

        ;; Perform the rebase
        (let [rebase-result (sh-ok? tmp-dir "git" "rebase" "master")]
          (is rebase-result "Rebase should succeed without conflicts"))

        ;; Count changesets after rebase (should be 5: base + master + A + B + C)
        (let [after-content (slurp (str tmp-dir "/" migrations-file))
              after-count (count-changesets after-content)]
          (is (= 5 after-count)
              (str "After rebase should have 5 changesets (base + master + A + B + C), got "
                   after-count ". Content:\n" after-content))

          ;; Verify specific migrations are present
          (is (str/includes? after-content "v58.2025-01-01T00:00:00") "Base migration present")
          (is (str/includes? after-content "v58.2025-01-02T00:00:00") "Commit A migration present")
          (is (str/includes? after-content "v58.2025-01-03T00:00:00") "Commit B migration present")
          (is (str/includes? after-content "v58.2025-01-04T00:00:00") "Commit C migration present")
          (is (str/includes? after-content "v58.2025-01-05T00:00:00") "Master migration present"))

        (finally
          ;; Cleanup
          (fs/delete-tree tmp-dir))))))

(defn run-tests
  "Run the integration tests. Call this manually since these tests
   are not included in the standard test suite."
  []
  (println "Running YAML merge driver integration tests...")
  (let [results (clojure.test/run-tests 'mage.merge-yaml-migrations-integration-test)]
    (if (and (zero? (:fail results)) (zero? (:error results)))
      (println "✓ All integration tests passed!")
      (println "✗ Some tests failed"))
    results))

(comment
  ;; Run tests manually:
  (run-tests)

  ;; Or from command line:
  ;; bb -e '(require (quote mage.merge-yaml-migrations-integration-test)) (mage.merge-yaml-migrations-integration-test/run-tests)'
  )

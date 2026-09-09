(ns mage.core-test
  "Tests for the mage CLI itself.
  Requires every other mage test namespace: `./bin/mage -test` runs `clojure.test/run-all-tests`, which
  only sees namespaces that are already loaded."
  (:require
   [babashka.fs :as fs]
   [babashka.tasks :as bt]
   [clojure.edn :as edn]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [mage.alias-test]
   [mage.bot.autobot-test]
   [mage.bot.dev-env-core-test]
   [mage.bot.env-test]
   [mage.bot.pr-env-test]
   [mage.bot.prompt-test]
   [mage.bot.repl-eval-test]
   [mage.doctor-test]
   [mage.fix-unused-requires-test]
   [mage.kondo-ratchet-test]
   [mage.merge-kondo-ratchets-test]
   [mage.merge-yaml-migrations-test]
   [mage.modules-test]
   [mage.nav-links-test]
   [mage.project-tests-test]
   [mage.quick-test-runner-test]
   [mage.shell-test]
   [mage.token-scan-test]
   [mage.util :as u]
   [mage.util-test]))

(set! *warn-on-reflection* true)

;; Documented in its own namespace as manual-only: it creates temporary git repositories and branches.
(def ^:private not-run-by-mage-test
  '#{mage.merge-yaml-migrations-integration-test})

(defn- test-namespaces-on-disk []
  (let [root (fs/path u/project-root-directory "mage" "test")]
    (into #{}
          (map (fn [path]
                 (-> (str (fs/relativize root path))
                     (str/replace #"\.clj$" "")
                     (str/replace "_" "-")
                     (str/replace "/" ".")
                     symbol)))
          (fs/glob root "**/*_test.clj"))))

(deftest every-test-namespace-is-loaded-test
  (testing "every mage test namespace is required, so `mage -test` actually runs it"
    (let [missing (sort (remove find-ns (apply disj (test-namespaces-on-disk) not-run-by-mage-test)))]
      (is (empty? missing)
          (str "Add these to this namespace's :require. `mage -test` runs `run-all-tests`, which only sees "
               "loaded namespaces, so nothing else reports them: " (str/join ", " missing))))))

(deftest bin-mage-has-help-test
  (doseq [help-cmds [[] [" "] ["  "] ["-h"] ["--help"] [" -h"] [" --help"] ["  -h"] ["  --help"]]
          :let [cmd (str "./bin/mage " (str/join " " help-cmds))
                title (format "'%s' returns help information" (pr-str cmd))]]
    (println title)
    (testing title
      (let [out (u/sh cmd)]
        (is (str/includes? out "The following tasks are available:"))))))

(deftest bb-task-has-example-test
  (doseq [task-name (u/public-bb-tasks-list)
          cmd [(str "./bin/mage " task-name " -h")
               (str "./bin/mage " task-name " --help")]]
    (println "Checking examples for command:" cmd)
    (testing (format "%s has examples with: '%s'" task-name cmd)
      (is (str/includes? (u/sh cmd) "Examples:")))))

(deftest invalid-task-names-print-help-test
  (doseq [task-name ["foo" "bar" "baz"]]
    (let [cmd (str "./bin/mage " task-name)
          title (format "invalid task names like: '%s' print help" cmd)]
      (testing title
        (let [result (try (bt/shell {:err :string :out :string} (str "./bin/mage " task-name))
                          (catch Exception e (:out (:proc (ex-data e)))))]
          (is (str/includes? result "The following tasks are available:")))))))

(deftest clojure-versions-match-mise-toml
  (let [mise-toml (str u/project-root-directory "/mise.toml")
        mise-content (slurp mise-toml)
        [_ mise-clj-version] (re-find #"clojure\ *=\ *\"(.*)\"" mise-content)

        deps-edn (str u/project-root-directory "/deps.edn")
        deps-content (edn/read-string (slurp deps-edn))
        deps-clj-version (get-in deps-content [:deps 'org.clojure/clojure :mvn/version])

        [earlier-touched last-touched] (sort-by fs/last-modified-time [mise-toml deps-edn])]
    (is (= deps-clj-version mise-clj-version)
        (str "The Clojure versions in deps.clj and mise.toml should match. Looks like you edited "
             last-touched ". Please update " earlier-touched " to match it."))))

(deftest bb-versions-match-mise-toml
  (let [mise-toml (str u/project-root-directory "/mise.toml")
        mise-content (slurp mise-toml)
        [_ mise-bb-version] (re-find #"babashka\ *=\ *\"(.*)\"" mise-content)

        bb-edn (str u/project-root-directory "/bb.edn")
        bb-content (edn/read-string (slurp bb-edn))
        bb-bb-version (:min-bb-version bb-content)

        [earlier-touched last-touched] (sort-by fs/last-modified-time [mise-toml bb-edn])]
    (is (= bb-bb-version mise-bb-version)
        (str "The Babashka versions in bb.edn and mise.toml should match. Looks like you edited "
             (fs/relativize u/project-root-directory last-touched)
             ". Please update " (fs/relativize u/project-root-directory earlier-touched) " to match it."))))

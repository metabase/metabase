(ns mage.project-tests-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [mage.project-tests :as project-tests]
   [mage.shell :as shell]))

;; Referenced by core_test.clj to ensure namespace is loaded
(def keep-me :loaded)

(set! *warn-on-reflection* true)

(defn- fake-sh
  "A [[mage.shell/sh*]] stand-in.
  Records each command in `calls`, prints one line for it, and exits with the code in `exits` at that
  call's position, or 0 past the end. An exception in `exits` is thrown instead, like a command that
  never started."
  [calls exits]
  (fn [& args]
    (let [args (if (map? (first args)) (rest args) args)
          exit (get exits (count @calls) 0)]
      (swap! calls conj (vec args))
      (println "ran:" (str/join " " args))
      (when (instance? Exception exit)
        (throw exit))
      {:exit exit, :out [], :err []})))

(defn- run-suites!
  "Run `suites` through [[project-tests/run-suites!]] with the given exit codes.
  Returns the failed suites, the recorded commands, and everything printed."
  [exits suites]
  (let [calls  (atom [])
        out    (java.io.StringWriter.)
        failed (binding [*out* out]
                 (project-tests/run-suites! (fake-sh calls exits) suites))]
    {:failed failed, :calls @calls, :out (str out)}))

(defn- occurrences [s substring]
  (count (re-seq (re-pattern (java.util.regex.Pattern/quote substring)) s)))

(deftest first-suite-failure-still-runs-second-suite-test
  (let [{:keys [failed calls out]} (run-suites! [1 0] ["migrations" "backend"])]
    (testing "both suites run, in order"
      (is (= [["clojure" "-M:test"]
              ["clojure" "-X:dev:dev/test:ee:ee-dev:drivers:drivers-dev:test:ci" ":only"
               (str '[dev.modules-config-test
                      metabase.core.modules-test
                      metabase.core.kondo-ratchet-test
                      metabase.core.kondo-ratchet-check-test
                      metabase.core.namespace-uniqueness-test
                      metabase.core.table-or-field-raw-usage-test])]]
             calls)))
    (testing "the failed suite is reported"
      (is (= ["migrations"] failed))
      (is (str/includes? out "Failed: migration checks")))
    (testing "each command's output appears exactly once"
      (is (= 1 (occurrences out "ran: clojure -M:test")))
      (is (= 1 (occurrences out "ran: clojure -X:dev:dev/test"))))))

(deftest first-suite-exception-still-runs-second-suite-test
  (let [{:keys [failed calls out]} (run-suites! [(ex-info "clojure: command not found" {})]
                                                ["migrations" "backend"])]
    (testing "the second suite still runs"
      (is (= 2 (count calls))))
    (testing "the suite that could not run is reported once, as a failure"
      (is (= ["migrations"] failed))
      (is (= 1 (occurrences out "Could not run migration checks -- clojure: command not found")))
      (is (str/includes? out "Failed: migration checks")))))

(deftest second-suite-failure-test
  (let [{:keys [failed calls]} (run-suites! [0 1] ["migrations" "backend"])]
    (is (= 2 (count calls)))
    (is (= ["backend"] failed))))

(deftest both-suites-fail-test
  (let [{:keys [failed out]} (run-suites! [1 1] ["migrations" "backend"])]
    (is (= ["migrations" "backend"] failed))
    (is (str/includes? out "Failed: migration checks, backend checks"))))

(deftest all-suites-pass-test
  (let [{:keys [failed out]} (run-suites! [] ["migrations" "backend"])]
    (is (= [] failed))
    (is (not (str/includes? out "Failed:")))))

(deftest default-suites-include-ratchet-check-test
  (let [calls (atom [])]
    (with-redefs [shell/sh* (fake-sh calls [])]
      (project-tests/run!))
    (is (= 4 (count @calls)))
    (is (= ["./bin/mage" "kondo-ratchets"] (last @calls)))))

(deftest security-lint-suite-test
  (testing "the linter's own tests are JVM namespaces under dev/test, outside the regular suite's pattern, and run
            through the same clojure command as the other backend checks"
    (let [[[cmd alias only nss :as call]] (:calls (run-suites! [] ["security-lint"]))]
      (is (= ["clojure" "-X:dev:dev/test:ee:ee-dev:drivers:drivers-dev:test:ci" ":only"] [cmd alias only]))
      (is (= 4 (count call)) "one command, with one :only vector")
      (is (= ["dev.security-lint.ast-test" "dev.security-lint.callgraph-test" "dev.security-lint.corpus-test"
              "dev.security-lint.engine-test" "dev.security-lint.request-taint-test" "dev.security-lint.rule-test"
              "dev.security-lint.rules-test" "dev.security-lint.sarif-test" "dev.security-lint.taint-test"]
             (map str (read-string nss))))))
  (testing "it is one of the default suites, so `project-tests` with no argument runs it"
    (is (str/includes? (:out (run-suites! [] ["security-lint"])) "Running security-lint checks"))))

(deftest targeted-suites-test
  (testing "modules runs only its own namespaces"
    (is (= [["clojure" "-X:dev:dev/test:ee:ee-dev:drivers:drivers-dev:test:ci" ":only"
             "[dev.modules-config-test metabase.core.modules-test]"]]
           (:calls (run-suites! [] ["modules"])))))
  (testing "ratchets checks the repository's policy file"
    (is (= [["./bin/mage" "kondo-ratchets"]]
           (:calls (run-suites! [] ["ratchets"]))))))

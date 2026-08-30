(ns mage.project-tests-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [mage.project-tests :as project-tests]))

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
               "[dev.modules-config-test metabase.core.modules-test metabase.core.kondo-ratchet-test]"]]
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

(deftest targeted-suites-test
  (testing "modules and ratchets run only their own namespaces"
    (is (= [["clojure" "-X:dev:dev/test:ee:ee-dev:drivers:drivers-dev:test:ci" ":only"
             "[dev.modules-config-test metabase.core.modules-test]"]]
           (:calls (run-suites! [] ["modules"]))))
    (is (= [["clojure" "-X:dev:dev/test:ee:ee-dev:drivers:drivers-dev:test:ci" ":only"
             "[metabase.core.kondo-ratchet-test]"]]
           (:calls (run-suites! [] ["ratchets"]))))))

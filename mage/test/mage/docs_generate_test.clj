(ns mage.docs-generate-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [mage.docs-generate :as docs-generate]
   [mage.shell :as shell]))

(set! *warn-on-reflection* true)

(def ^:private backend-command ["clojure" "-M:ee:doc" "all-documentation"])

(defn- fake-sh
  "A [[mage.shell/sh*]] stand-in.
  Records each command in `calls` and exits with the code `exits` maps that command to, or 0.
  An exception in `exits` is thrown instead, like a command that never started."
  [calls exits]
  (fn [& command]
    (let [exit (get exits (vec command) 0)]
      (swap! calls conj (vec command))
      (when (instance? Exception exit)
        (throw exit))
      {:exit exit, :out [], :err []})))

(defn- run-suites!
  "Run `suite-names` through [[docs-generate/run-suites!]] with the given exit codes.
  Returns the failed suites, the recorded commands, and everything printed."
  [exits suite-names]
  (let [calls  (atom [])
        out    (java.io.StringWriter.)
        failed (binding [*out* out]
                 (docs-generate/run-suites! (fake-sh calls exits) suite-names))]
    {:failed failed, :calls @calls, :out (str out)}))

(deftest every-suite-runs-test
  (let [{:keys [failed calls out]} (run-suites! {} docs-generate/suite-names)]
    (testing "every suite runs once, in order"
      (is (= (map @#'docs-generate/suite->command docs-generate/suite-names) calls)))
    (testing "each suite reports that it finished"
      (doseq [suite docs-generate/suite-names]
        (is (str/includes? out (str "Generated " suite " docs")))))
    (is (= [] failed))))

(deftest failed-suite-still-runs-later-suites-test
  (let [{:keys [failed calls out]} (run-suites! {backend-command                   1
                                                 ["bun" "run" "embedding-sdk:docs:generate"] 1}
                                                docs-generate/suite-names)]
    (testing "every suite runs"
      (is (= 4 (count calls))))
    (testing "the failed suites are reported, in suite order"
      (is (= ["backend" "embedding-sdk"] failed))
      (is (str/includes? out "Failed: backend, embedding-sdk")))))

(deftest suite-that-cannot-start-is-a-failure-test
  (let [{:keys [failed calls out]} (run-suites! {["bun" "run" "embedding-eajs:docs:generate"]
                                                 (ex-info "bun: command not found" {})}
                                                ["embedding-eajs" "backend"])]
    (testing "the other suite still runs"
      (is (= 2 (count calls))))
    (testing "the suite that could not run is reported as a failure"
      (is (= ["embedding-eajs"] failed))
      (is (str/includes? out "Could not generate embedding-eajs docs -- bun: command not found")))))

(deftest run!-test
  (testing "with a suite, runs only that suite and exits nonzero when it fails"
    (let [calls (atom [])]
      (with-redefs [shell/sh* (fake-sh calls {backend-command 1})]
        (is (= 1 (try
                   (with-out-str (docs-generate/run! "backend" {}))
                   nil
                   (catch clojure.lang.ExceptionInfo e
                     (:babashka/exit (ex-data e)))))))
      (is (= [backend-command] @calls))))
  (testing "with `:dir`, runs every suite in that checkout"
    (let [calls (atom [])]
      (with-redefs [shell/sh* (fake-sh calls {})]
        (with-out-str (docs-generate/run! nil {:dir "/tmp/release-checkout"})))
      (is (= (repeat (count docs-generate/suite-names) {:dir "/tmp/release-checkout"})
             (map first @calls))))))

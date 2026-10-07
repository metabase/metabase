(ns mage.generate-docs-test
  (:require
   [clojure.edn :as edn]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [mage.generate-docs :as generate-docs]
   [mage.shell :as shell]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private backend-command ["clojure" "-M:ee:doc" "all-documentation"])

(def ^:private other-commands
  [["./bin/bb" "bin/generate-usage-analytics-docs.bb"]
   ["bun" "run" "embedding-sdk:docs:generate"]
   ["bun" "run" "embedding-eajs:docs:generate"]])

(defn- fake-sh
  "A [[mage.shell/sh*]] stand-in.
  Records each command in `calls` and exits with the code `exits` maps that command to, or 0.
  An exception in `exits` is thrown instead, like a command that never started.
  Suites run on more than one thread, so exits are looked up by command rather than by call order."
  [calls exits]
  (fn [& command]
    (let [exit (get exits (vec command) 0)]
      (swap! calls conj (vec command))
      (when (instance? Exception exit)
        (throw exit))
      {:exit exit, :out [], :err []})))

(defn- run-suites!
  "Run `suite-names` through [[generate-docs/run-suites!]] with the given exit codes.
  Returns the failed suites, the recorded commands, and everything printed."
  [exits suite-names]
  (let [calls  (atom [])
        out    (java.io.StringWriter.)
        failed (binding [*out* out]
                 (generate-docs/run-suites! (fake-sh calls exits) suite-names))]
    {:failed failed, :calls @calls, :out (str out)}))

(deftest every-suite-runs-test
  (let [{:keys [failed calls out]} (run-suites! {} generate-docs/suite-names)]
    (testing "every suite runs once"
      (is (= (set (cons backend-command other-commands))
             (set calls)))
      (is (= 4 (count calls))))
    (testing "the suites other than backend run in order"
      (is (= other-commands
             (remove #{backend-command} calls))))
    (testing "each suite reports that it finished"
      (doseq [suite generate-docs/suite-names]
        (is (str/includes? out (str "Generated " suite " docs")))))
    (is (= [] failed))))

(deftest backend-runs-beside-the-other-suites-test
  (testing "the backend suite is still running when the next suite starts"
    (let [other-started (promise)
          sh            (fn [& command]
                          (if (= backend-command (vec command))
                            ;; Serial suites never deliver while this waits, so the backend suite fails.
                            {:exit (if (deref other-started 5000 false) 0 1)}
                            (do (deliver other-started true)
                                {:exit 0})))
          failed        (binding [*out* (java.io.StringWriter.)]
                          (generate-docs/run-suites! sh generate-docs/suite-names))]
      (is (= [] failed)))))

(deftest failed-suite-still-runs-later-suites-test
  (let [{:keys [failed calls out]} (run-suites! {backend-command                   1
                                                 ["bun" "run" "embedding-sdk:docs:generate"] 1}
                                                generate-docs/suite-names)]
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
  (testing "with no suite, runs every suite"
    (let [calls (atom [])]
      (with-redefs [shell/sh* (fake-sh calls {})]
        (with-out-str (generate-docs/run!)))
      (is (= 4 (count @calls)))))
  (testing "with a suite, runs only that suite"
    (let [calls (atom [])]
      (with-redefs [shell/sh* (fake-sh calls {})]
        (with-out-str (generate-docs/run! "backend")))
      (is (= [backend-command] @calls))))
  (testing "a failed suite exits nonzero"
    (with-redefs [shell/sh* (fake-sh (atom []) {backend-command 1})]
      (is (= 1 (try
                 (with-out-str (generate-docs/run! "backend"))
                 nil
                 (catch clojure.lang.ExceptionInfo e
                   (:babashka/exit (ex-data e)))))))))

(defn- generate-docs-task
  "The `generate-docs` task map from bb.edn."
  []
  (-> (str u/project-root-directory "/bb.edn") slurp edn/read-string :tasks (get 'generate-docs)))

(defn- developer-guide-suites
  "The suite names in the table of the \"Regenerate docs built from source\" section of the developer guide."
  []
  (let [guide   (slurp (str u/project-root-directory "/docs/developers-guide/docs.md"))
        section (some #(when (str/starts-with? % "Regenerate docs built from source") %)
                      (str/split guide #"(?m)^## "))]
    (mapv second (re-seq #"(?m)^\| `([a-z-]+)` +\|" (or section "")))))

(deftest suite-names-match-bb-edn-and-developer-guide-test
  (let [{:keys [arg-schema examples]} (generate-docs-task)]
    (testing "bb.edn accepts every suite"
      (is (= generate-docs/suite-names
             (vec (drop 2 (get-in arg-schema [2 1]))))))
    (testing "bb.edn has an example for every suite"
      (is (= generate-docs/suite-names
             (into [] (keep (fn [[command]]
                              (second (re-find #"^\./bin/mage generate-docs (\S+)$" command))))
                   examples))))
    (testing "the developer guide lists every suite"
      (is (= generate-docs/suite-names
             (developer-guide-suites))))))

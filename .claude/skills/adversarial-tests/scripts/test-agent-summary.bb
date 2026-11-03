#!/usr/bin/env bb
;; Prints one tab-separated line per deftest that a ./bin/test-agent run selected:
;;
;;   <status>  <test file>  <namespace>/<test name>  <expected and actual, or the exception>
;;
;; Status is PASSED, FAILED (an `is` disagreed), ERROR (the test threw) or LOAD_ERROR (the run stopped before any test
;; ran, usually because a namespace failed to compile). Tests that the run's `:only` did not select are left out.
;;
;;   bb test-agent-summary.bb <test-agent-output> <checkout-root> <test-file> [<test-file> ...]
;;
;; Run it from a directory without a bb.edn, or bb resolves the project's dependencies first.

(require '[clojure.java.io :as io]
         '[clojure.string :as str])

(def max-message-length 300)

(defn- test-names [file]
  (let [text (slurp file)]
    {:ns    (second (re-find #"\(ns\s+(?:\^\S+\s+)*([^\s()]+)" text))
     :tests (map second (re-seq #"\((?:deftest|defspec)\s+(?:\^\S+\s+)*([^\s()]+)" text))}))

(defn- selected-symbols
  "The namespace and test symbols the run's `:only` selected, read from its `Running tests in [...]` line."
  [lines]
  (some->> lines
           (some #(second (re-find #"^Running tests in \[(.*)\]" %)))
           (re-seq #"[^\s\[\]]+")
           set))

(defn- selected? [selection ns-name test-name]
  (or (nil? selection)
      (contains? selection ns-name)
      (contains? selection (str ns-name "/" test-name))))

(defn- truncate [s n]
  (subs s 0 (min n (count s))))

(defn- labelled-line
  "The text after `label` on the first line of `lines` that starts with it, or the next non-blank line when that is empty."
  [lines label]
  (let [from (drop-while #(not (str/starts-with? (str/trim %) label)) lines)
        line (str/trim (subs (str/trim (or (first from) label)) (count label)))]
    (if (str/blank? line)
      (str/trim (or (first (remove str/blank? (rest from))) ""))
      line)))

(defn- first-failure-line
  "Expected and actual values under the first FAIL header for `qualified-name`, or the exception under the first ERROR."
  [lines qualified-name status]
  (let [header (re-pattern (str "^(FAIL|ERROR) in " (java.util.regex.Pattern/quote qualified-name) " "))
        after  (rest (drop-while #(not (re-find header %)) lines))
        actual (labelled-line after "actual:")]
    (if (= status "ERROR")
      (truncate actual max-message-length)
      (str "expected: " (truncate (labelled-line after "expected:") (quot max-message-length 2))
           " | actual: " (truncate actual (quot max-message-length 2))))))

(defn- load-error-line [lines]
  (or (some #(when (re-find #"Syntax error|Could not locate|Unable to resolve|No such var|Exception" %) (str/trim %))
            lines)
      "the run stopped before any test ran"))

(let [[output-file root & test-files] *command-line-args*]
  (when (or (nil? root) (empty? test-files))
    (binding [*out* *err*]
      (println "usage: test-agent-summary.bb <test-agent-output> <checkout-root> <test-file> [<test-file> ...]")
      (System/exit 2)))
  (let [lines     (remove #(str/starts-with? % "Running Changeset:") (str/split-lines (slurp output-file)))
        selection (selected-symbols lines)
        ran?      (some #(re-find #"^Running \d+ tests" %) lines)
        status-of (fn [qualified-name]
                    (let [header #(re-pattern (str "^" % " in " (java.util.regex.Pattern/quote qualified-name) " "))]
                      (cond
                        (not ran?)                                 "LOAD_ERROR"
                        (some #(re-find (header "ERROR") %) lines) "ERROR"
                        (some #(re-find (header "FAIL") %) lines)  "FAILED"
                        :else                                      "PASSED")))]
    (doseq [file  test-files
            :let  [path                        (if (.isAbsolute (io/file file)) (io/file file) (io/file root file))
                   {ns-name :ns, tests :tests} (test-names path)]
            test  tests
            :when (selected? selection ns-name test)
            :let  [qualified-name (str ns-name "/" test)
                   status         (status-of qualified-name)]]
      (println (str/join "\t" [status
                               file
                               qualified-name
                               (case status
                                 "PASSED"     ""
                                 "LOAD_ERROR" (load-error-line lines)
                                 (first-failure-line lines qualified-name status))])))))

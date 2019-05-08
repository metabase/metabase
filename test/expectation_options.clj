(ns expectation-options
  "Namespace expectations will automatically load before running a tests"
  (:require [clojure
             [data :as data]
             [set :as set]]
            [expectations :as expectations]
            [metabase.util :as u]
            [metabase.util.date :as du])
  (:import java.util.concurrent.TimeoutException))

;;; ---------------------------------------- Expectations Framework Settings -----------------------------------------

;; ## EXPECTATIONS FORMATTING OVERRIDES

;; These overrides the methods Expectations usually uses for printing failed tests.
;; These are basically the same as the original implementations, but they colorize and pretty-print the
;; output, which makes it an order of magnitude easier to read, especially for tests that compare a
;; lot of data, like Query Processor or API tests.
(defn- format-failure [e a str-e str-a]
  {:type             :fail
   :expected-message (when-let [in-e (first (data/diff e a))]
                       (format "\nin expected, not actual:\n%s" (u/pprint-to-str 'green in-e)))
   :actual-message   (when-let [in-a (first (data/diff a e))]
                       (format "\nin actual, not expected:\n%s" (u/pprint-to-str 'red in-a)))
   :raw              [str-e str-a]
   :result           ["\nexpected:\n"
                      (u/pprint-to-str 'green e)
                      "\nwas:\n"
                      (u/pprint-to-str 'red a)]})

(defmethod expectations/compare-expr :expectations/maps [e a str-e str-a]
  (let [[in-e in-a] (data/diff e a)]
    (if (and (nil? in-e) (nil? in-a))
      {:type :pass}
      (format-failure e a str-e str-a))))

(defmethod expectations/compare-expr :expectations/sets [e a str-e str-a]
  (format-failure e a str-e str-a))

(defmethod expectations/compare-expr :expectations/sequentials [e a str-e str-a]
  (let [diff-fn (fn [e a] (seq (set/difference (set e) (set a))))]
    (assoc (format-failure e a str-e str-a)
           :message (cond
                      (and (= (set e) (set a))
                           (= (count e) (count a))
                           (= (count e) (count (set a)))) "lists appear to contain the same items with different ordering"
                      (and (= (set e) (set a))
                           (< (count e) (count a)))       "some duplicate items in actual are not expected"
                      (and (= (set e) (set a))
                           (> (count e) (count a)))       "some duplicate items in expected are not actual"
                      (< (count e) (count a))             "actual is larger than expected"
                      (> (count e) (count a))             "expected is larger than actual"))))

;;; ---------------------------------------------- check-for-slow-tests ----------------------------------------------

(def ^:private test-timeout-ms (* 60 1000))

(defn- check-for-slow-tests
  "If any test takes longer that 60 seconds to run return a TimeoutException, effectively failing the test."
  [run]
  (fn [test-fn]
    (deref
     (future
       (try
         (run test-fn)
         (catch Throwable e
           e)))
     test-timeout-ms
     ;; return Exception than throwing, otherwise it will mess up our test running
     (TimeoutException. (format "Test timed out after %s" (du/format-milliseconds test-timeout-ms))))))


;;; ---------------------------------------------- check-table-cleanup -----------------------------------------------

(def ^:private models-to-check
  "Add models from `metabase.models.*` to the following vector to have the `check-table-cleanup` function below error
  if any instances of that model are found after each test finishes."
  [])

(defn- tables-with-data->error-msg
  "Function that takes a list of modes and whill query each. If records are found, return a string with an error
  message"
  [models-to-check]
  (for [model models-to-check
        :let  [instances-found (count (model))
               more-than-one? (> 1 instances-found)]
        :when (< 0 instances-found)]
    (str "Found '" instances-found "' instance" (when more-than-one? "s")
         " of '" (:name model) "' that " (if more-than-one? "were" "was")
         " not cleaned up.")))

(def ^{:arglists '([run])} check-table-cleanup
  "Function that will run around each test. This function is usually a noop, but it useful for helping to debug stale
  data in local development. Modify the private `models-to-check` var to check if there are any rows in the given
  model's table after each expectation. If a row is found, the relevant information will be written to standard out
  and the test run will exit"
  (if-not (seq models-to-check)
    identity
    (fn [run]
      (fn [test-fn]
        (let [result              (run test-fn)
              {:keys [file line]} (-> test-fn meta :the-var meta)
              error-msgs          (tables-with-data->error-msg models-to-check)]
          (when (seq error-msgs)
            (println "\n-----------------------------------------------------")
            (doseq [error-msg error-msgs]
              (println error-msg))
            (println "-----------------------------------------------------")
            (printf "\nStale test rows found in tables, check '%s' at line '%s'\n\n" file line)
            (flush)
            ;; I found this necessary as throwing an exception would show the exception, but the test run would hang and
            ;; you'd have to Ctrl-C anyway
            (System/exit 1))
          result)))))


;;; -------------------------------------------- Putting it all together ---------------------------------------------

(defn- log-tests [run]
  (fn [test-fn]
    (let [{:keys [file line]} (-> test-fn meta :the-var meta)]
      (println (format "Run %s %s" file line)))
    (run test-fn)))

(def ^:private ^{:expectations-options :in-context} test-middleware
  (-> (fn [test-fn]
        (test-fn))
      ;; uncomment `log-tests` if you need to debug tests or see which ones are being noisy
      #_log-tests
      check-for-slow-tests
      check-table-cleanup))

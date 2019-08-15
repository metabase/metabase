(ns expectation-options
  "Namespace expectations will automatically load before running a tests"
  (:require [clojure
             [data :as data]
             [set :as set]]
            [expectations :as expectations]
            [metabase.models
             [database :refer [Database]]
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.util :as u]
            [metabase.util.date :as du]
            [toucan.db :as db]))

(defn- test-name [test-fn]
  (let [{:keys [file line]} (-> test-fn meta :the-var meta)]
    (format "%s %s" file line)))

;;; ---------------------------------------- Expectations Framework Settings -----------------------------------------

;; ## EXPECTATIONS FORMATTING OVERRIDES

;; These overrides the methods Expectations usually uses for printing failed tests.
;; These are basically the same as the original implementations, but they colorize and pretty-print the
;; output, which makes it an order of magnitude easier to read, especially for tests that compare a
;; lot of data, like Query Processor or API tests.
(defn- format-failure [e a str-e str-a]
  (let [[only-in-expected only-in-actual] (data/diff e a)]
    {:type             :fail
     :expected-message (when only-in-expected
                         (format "\nin expected, not actual:\n%s" (u/pprint-to-str 'green only-in-expected)))
     :actual-message   (when only-in-actual
                         (format "\nin actual, not expected:\n%s" (u/pprint-to-str 'red only-in-actual)))
     :raw              [str-e str-a]
     :result           [(format "\nexpected: %s\n" (class e))
                        (u/pprint-to-str 'green e)
                        (format "\nwas: %s\n" (class a))
                        (u/pprint-to-str 'red a)]}))

(defmethod expectations/compare-expr :expectations/maps [e a str-e str-a]
  (let [[in-e in-a] (data/diff e a)]
    (if (and (nil? in-e) (nil? in-a))
      {:type :pass}
      (format-failure e a str-e str-a))))

(defmethod expectations/compare-expr :expectations/sets [e a str-e str-a]
  (let [[in-e in-a] (data/diff e a)]
    (if (and (nil? in-e) (nil? in-a))
      {:type :pass}
      (format-failure e a str-e str-a))))

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


;;; ------------------------------------------------- log-slow-tests -------------------------------------------------

(def ^:private slow-test-threshold-ms 5000)

(defn- log-slow-tests
  "Log a message about any test that takes longer than `slow-test-threshold-ms` to run. Ideally we'd keep all our tests
  under that threshold so the test suite finishes quickly."
  [run]
  (fn [test-fn]
    (let [start-time-ms (System/currentTimeMillis)]
      (run test-fn)
      (let [duration-ms (- (System/currentTimeMillis) start-time-ms)]
        (when (> duration-ms slow-test-threshold-ms)
          (println
           (u/format-color 'red "%s is a slow test! It took %s to finish."
             (test-name test-fn) (du/format-milliseconds duration-ms))
           "(This may have been because it was loading test data.)"))))))


;;; ------------------------------------------------ enforce-timeout -------------------------------------------------

(def ^:private test-timeout-ms (* 5 60 1000))

(defn- enforce-timeout
  "If any test takes longer that 5 minutes to run print a message and stop running tests. (This usually happens when
  something is fundamentally broken, and we don't want to continue running thousands of tests that can hang for a
  minute each.)"
  [run]
  (fn [test-fn]
    (when (= (deref (future (run test-fn)) test-timeout-ms ::timed-out)
             ::timed-out)
      (println
       (u/format-color 'red "%s timed out after %s" (test-name test-fn) (du/format-milliseconds test-timeout-ms)))
      (println "Stacktraces:")
      (doseq [[thread stacktrace] (Thread/getAllStackTraces)]
        (println "\n" (u/pprint-to-str 'red thread))
        (doseq [frame stacktrace]
          (println frame)))
      (System/exit 1))))


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
        :let  [instances-found (count (model))]
        :when (pos? instances-found)]
    (format "Found %d instances of %s that were not cleaned up." instances-found (:name model))))

(def ^{:arglists '([run])} check-table-cleanup
  "Function that will run around each test. This function is usually a noop, but it useful for helping to debug stale
  data in local development. Modify the private `models-to-check` var to check if there are any rows in the given
  model's table after each expectation. If a row is found, the relevant information will be written to standard out
  and the test run will exit"
  (if-not (seq models-to-check)
    identity
    (fn [run]
      (fn [test-fn]
        (run test-fn)
        (let [error-msgs (tables-with-data->error-msg models-to-check)]
          (when (seq error-msgs)
            (println "\n-----------------------------------------------------")
            (doseq [error-msg error-msgs]
              (println error-msg))
            (println "-----------------------------------------------------")
            (printf "\nStale test rows found in tables, check %s\n\n" (test-name test-fn))
            (flush)
            ;; I found this necessary as throwing an exception would show the exception, but the test run would hang and
            ;; you'd have to Ctrl-C anyway
            (System/exit 1)))))))


;;; ------------------------------------------- check-test-data-unchanged --------------------------------------------

(defn- test-data-state
  "State of the metadata for the test database, if test database has already been loaded."
  []
  (when-let [database-id (db/select-one-id Database :engine "h2", :name "test-data")]
    (let [tables (when database-id
                   (for [table (db/select Table :db_id database-id {:order-by [[:id :asc]]})]
                     (dissoc table :updated_at)))]
      {:tables tables
       :fields (when (seq tables)
                 (for [field (db/select Field :table_id [:in (map :id tables)] {:order-by [[:id :asc]]})]
                   (dissoc field :updated_at)))})))

(defn check-test-data-unchanged [run]
  (fn [test-fn]
    (let [before-state (test-data-state)]
      (run test-fn)
      (when before-state
        (let [after-state (test-data-state)]
          (when-not (= before-state after-state)
            (println
             "Test data has changed while running" (test-name test-fn) "\n"
             (let [[only-in-before only-in-after] (data/diff before-state after-state)]
               (format "Only in before:\n%s\nOnly in after:\n%s"
                       (u/pprint-to-str 'magenta only-in-before)
                       (u/pprint-to-str 'cyan only-in-after))))))))))


;;; -------------------------------------------- Putting it all together ---------------------------------------------

(defn- log-tests [run]
  (comp
   run
   (fn [test-fn]
     (let [{:keys [file line]} (-> test-fn meta :the-var meta)]
       (println (format "Run %s %s" file line)))
     test-fn)))

;; This middleware does not need to worry about passing results to the next function in the chain; `test-fn` always
;; returns `nil`
(def ^:private ^{:expectations-options :in-context} test-middleware
  (-> (fn [test-fn]
        (test-fn))
      ;;
      ;; uncomment `log-tests` if you need to debug tests or see which ones are being noisy or hanging forever
      #_log-tests
      ;;
      ;; Uncomment `check-test-data-unchanged` when you want to debug situations where tests are being bad citizens
      ;; and leaving the metadata about the test data in a different state than it started out with. This is not
      ;; enabled by default because it adds ~5ms to each test which adds up when we have ~4000 tests (as of May 2019)
      #_check-test-data-unchanged
      log-slow-tests
      enforce-timeout
      check-table-cleanup))

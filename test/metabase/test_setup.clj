(ns metabase.test-setup
  "Functions that run before + after unit tests (setup DB, start web server, load test data)."
  (:require [clojure
             [data :as data]
             [set :as set]]
            [clojure.tools.logging :as log]
            [expectations :refer :all]
            [metabase
             [core :as core]
             [db :as mdb]
             [driver :as driver]
             [plugins :as plugins]
             [task :as task]
             [util :as u]]
            [metabase.core.initialization-status :as init-status]
            [metabase.models.setting :as setting]
            [metabase.util.date :as du]))

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

(defmethod compare-expr :expectations/maps [e a str-e str-a]
  (let [[in-e in-a] (data/diff e a)]
    (if (and (nil? in-e) (nil? in-a))
      {:type :pass}
      (format-failure e a str-e str-a))))

(defmethod compare-expr :expectations/sets [e a str-e str-a]
  (format-failure e a str-e str-a))

(defmethod compare-expr :expectations/sequentials [e a str-e str-a]
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


;;; ------------------------------- Functions That Get Ran On Test Suite Start / Stop --------------------------------

;; `test-startup` function won't work for loading the drivers because they need to be available at evaluation time for
;; some of the unit tests work work properly
(du/profile "(driver/find-and-load-drivers!) (in metabase.test-setup)"
  (driver/find-and-load-drivers!))

(defn test-startup
  {:expectations-options :before-run}
  []
  ;; We can shave about a second from unit test launch time by doing the various setup stages in on different threads
  ;; Start Jetty in the BG so if test setup fails we have an easier time debugging it -- it's trickier to debug things
  ;; on a BG thread
  (let [start-jetty! (future (core/start-jetty!))]
    (try
      (plugins/setup-plugins!)
      (log/info (format "Setting up %s test DB and running migrations..." (name (mdb/db-type))))
      (mdb/setup-db! :auto-migrate true)
      ;; we don't want to actually start the task scheduler (we don't want sync or other stuff happening in the BG
      ;; while running tests), but we still need to make sure it sets itself up properly so tasks can get scheduled
      ;; without throwing Exceptions
      (#'task/set-jdbc-backend-properties!)
      (setting/set! :site-name "Metabase Test")
      (init-status/set-complete!)

      ;; make sure the driver test extensions are loaded before running the tests. :reload them because otherwise we
      ;; get wacky 'method in protocol not implemented' errors when running tests against an individual namespace
      (du/profile "Load all drivers & reload test extensions"
        (doseq [engine (keys (driver/available-drivers))
                :let   [driver-test-ns (symbol (str "metabase.test.data." (name engine)))]]
          (u/ignore-exceptions
            (require driver-test-ns :reload))))

      ;; If test setup fails exit right away
      (catch Throwable e
        (log/error (u/format-color 'red "Test setup failed: %s\n%s" e (u/pprint-to-str (vec (.getStackTrace e)))))
        (System/exit -1)))

    @start-jetty!))


(defn test-teardown
  {:expectations-options :after-run}
  []
  (log/info "Shutting down Metabase unit test runner")
  (core/stop-jetty!))

(defn call-with-test-scaffolding
  "Runs `test-startup` and ensures `test-teardown` is always called. This function is useful for running a test (or test
  namespace) at the repl with the appropriate environment setup for the test to pass."
  [f]
  (try
    (test-startup)
    (f)
    (catch Exception e
      (throw e))
    (finally
      (test-teardown))))

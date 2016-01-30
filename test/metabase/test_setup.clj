(ns metabase.test-setup
  "Functions that run before + after unit tests (setup DB, start web server, load test data)."
  (:require (clojure.java [classpath :as classpath]
                          [io :as io])
            [clojure.set :as set]
            [clojure.tools.logging :as log]
            [clojure.tools.namespace.find :as ns-find]
            [expectations :refer :all]
            (metabase [core :as core]
                      [db :as db]
                      [driver :as driver]
                      [util :as u])
            (metabase.models [setting :as setting]
                             [table :refer [Table]])
            [metabase.test.data :as data]
            [metabase.test.data.datasets :as datasets]
            [metabase.util :as u]))

;; # ---------------------------------------- EXPECTAIONS FRAMEWORK SETTINGS ------------------------------

;; ## GENERAL SETTINGS

;; Don't run unit tests whenever JVM shuts down
(expectations/disable-run-on-shutdown)


;; ## EXPECTATIONS FORMATTING OVERRIDES

;; These overrides the methods Expectations usually uses for printing failed tests.
;; These are basically the same as the original implementations, but they colorize and pretty-print the
;; output, which makes it an order of magnitude easier to read, especially for tests that compare a
;; lot of data, like Query Processor or API tests.
(defn- format-failure [e a str-e str-a]
  {:type             :fail
   :expected-message (when-let [in-e (first (clojure.data/diff e a))]
                       (format "\nin expected, not actual:\n%s" (u/pprint-to-str 'green in-e)))
   :actual-message   (when-let [in-a (first (clojure.data/diff a e))]
                       (format "\nin actual, not expected:\n%s" (u/pprint-to-str 'red in-a)))
   :raw              [str-e str-a]
   :result           ["\nexpected:\n"
                      (u/pprint-to-str 'green e)
                      "\nwas:\n"
                      (u/pprint-to-str 'red a)]})

(defmethod compare-expr :expectations/maps [e a str-e str-a]
  (let [[in-e in-a] (clojure.data/diff e a)]
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

;; # ------------------------------ FUNCTIONS THAT GET RUN ON TEST SUITE START / STOP ------------------------------

;; this is a little odd, but our normal `test-startup` function won't work for loading the drivers because
;; they need to be available at evaluation time for some of the unit tests work work properly, so we put this here
(driver/find-and-load-drivers!)

(defn test-startup
  {:expectations-options :before-run}
  []
  ;; We can shave about a second from unit test launch time by doing the various setup stages in on different threads
  ;; Start Jetty in the BG so if test setup fails we have an easier time debugging it -- it's trickier to debug things on a BG thread
  (let [start-jetty! (future (core/start-jetty))]

    (try
      (log/info "Setting up test DB and running migrations...")
      (db/setup-db :auto-migrate true)
      (setting/set :site-name "Metabase Test")
      (core/initialization-complete!)
      ;; If test setup fails exit right away
      (catch Throwable e
        (log/error (u/format-color 'red "Test setup failed: %s\n%s" e (u/pprint-to-str (.getStackTrace e))))
        (System/exit -1)))

    @start-jetty!))


(defn test-teardown
  {:expectations-options :after-run}
  []
  (log/info "Shutting down Metabase unit test runner")
  (core/stop-jetty))



;; Check that we're on target for every public var in Metabase having a docstring
;; This will abort unit tests if we don't hit our target
(defn- expected-docstr-percentage-for-day-of-year
  "Calculate the percentage of public vars we expect to have a docstring by the current date in time. This ranges from 80% for the end of January to 100% half way through the year."
  ([]
   (expected-docstr-percentage-for-day-of-year (u/date-extract :day-of-year)))
  ([doy]
   (let [start-day                  30
         start-percent              80.0
         target-doy-for-100-percent 180
         remaining-percent          (- 100.0 start-percent)
         remaining-days             (- target-doy-for-100-percent start-day)]
     (Math/min (+ start-percent (* (/ remaining-percent remaining-days)
                                   (- doy start-day)))
               100.0))))

(defn- does-metabase-need-more-dox? []
  (let [symb->has-doc?      (into {} (for [ns          (ns-find/find-namespaces (classpath/classpath))
                                           :let        [nm (try (str (ns-name ns))
                                                                (catch Throwable _))]
                                           :when       nm
                                           :when       (re-find #"^metabase" nm)
                                           :when       (not (re-find #"test" nm))
                                           [symb varr] (ns-publics ns)]
                                       {(symbol (str nm "/" symb)) (boolean (:doc (meta varr)))}))
        vs                  (vals symb->has-doc?)
        total               (count vs)
        num-with-dox        (count (filter identity vs))
        percentage          (float (* (/ num-with-dox total)
                                      100.0))
        expected-percentage (expected-docstr-percentage-for-day-of-year)
        needs-more-dox?     (< percentage expected-percentage)]
    (println (u/format-color (if needs-more-dox? 'red 'green)
                 "%.1f%% of Metabase public vars have docstrings. (%d/%d) Expected for today: %.1f%%" percentage num-with-dox total expected-percentage))
    (println (u/format-color 'cyan "Why don't you go write a docstr for %s?" (first (shuffle (for [[symb has-doc?] symb->has-doc?
                                                                                                   :when           (not has-doc?)]
                                                                                               symb)))))
    needs-more-dox?))


(defn- throw-if-metabase-doesnt-have-enough-docstrings!
  {:expectations-options :before-run}
  []
  (when (does-metabase-need-more-dox?)
    (println (u/format-color 'red "Metabase needs more docstrings! Go write some more (or make some vars ^:private) before proceeding."))
    (System/exit -1)))

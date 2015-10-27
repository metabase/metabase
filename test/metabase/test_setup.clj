(ns metabase.test-setup
  "Functions that run before + after unit tests (setup DB, start web server, load test data)."
  (:require [clojure.java.io :as io]
            [clojure.set :as set]
            [clojure.tools.logging :as log]
            [expectations :refer :all]
            (metabase [core :as core]
                      [db :as db]
                      [util :as u])
            (metabase.models [table :refer [Table]])
            [metabase.test.data.datasets :as datasets]))

;; # ---------------------------------------- EXPECTAIONS FRAMEWORK SETTINGS ------------------------------

;; ## GENERAL SETTINGS

;; Don't run unit tests whenever JVM shuts down
;; it's pretty annoying to have our DB reset all the time
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

(defn load-test-datasets
  "Call `load-data!` on all the datasets we're testing against."
  []
  (doseq [dataset-name datasets/test-dataset-names]
    (log/info (format "Loading test data: %s..." (name dataset-name)))
    (let [dataset (datasets/dataset-name->dataset dataset-name)]
      (datasets/load-data! dataset)

      ;; Check that dataset is loaded and working
      (assert (Table (datasets/table-name->id dataset :venues))
        (format "Loading test dataset %s failed: could not find 'venues' Table!" dataset-name)))))

(defn test-startup
  {:expectations-options :before-run}
  []
  ;; We can shave about a second from unit test launch time by doing the various setup stages in on different threads
  (let [setup-db (future (time (do (log/info "Setting up test DB and running migrations...")
                                   (db/setup-db :auto-migrate true)
                                   (load-test-datasets)
                                   (metabase.models.setting/set :site-name "Metabase Test")
                                   (core/initialization-complete!))))]
    (core/start-jetty)
    @setup-db))


(defn test-teardown
  {:expectations-options :after-run}
  []
  (log/info "Shutting down Metabase unit test runner")
  (core/stop-jetty))

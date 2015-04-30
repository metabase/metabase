(ns metabase.test-setup
  "Functions that run before + after unit tests (setup DB, start web server, load test data)."
  (:require [clojure.java.io :as io]
            [clojure.tools.logging :as log]
            [expectations :refer :all]
            (metabase [core :as core]
                      [db :as db]
                      [task :as task]
                      [test-data :as h2-test-data])
            [metabase.driver.mongo.test-data :as mongo-test-data]))

(declare clear-test-db)

;; # SETTINGS

;; Don't run unit tests whenever JVM shuts down
;; it's pretty annoying to have our DB reset all the time
(expectations/disable-run-on-shutdown)


;; # FUNCTIONS THAT GET RUN ON TEST SUITE START / STOP

(defn test-startup
  {:expectations-options :before-run}
  []
  (log/info "Starting up Metabase unit test runner")
  ;; clear out any previous test data that's lying around
  (log/info "Clearing out test DB...")
  (clear-test-db)
  (log/info "Setting up test DB and running migrations...")
  (db/setup-db :auto-migrate true)
  (log/info "Loading test data: h2...")
  @h2-test-data/test-db
  (assert (integer? @h2-test-data/db-id))
  (log/info "Loading test data: mongo...")
  (mongo-test-data/destroy!)
  @mongo-test-data/mongo-test-db
  (assert (integer? @mongo-test-data/mongo-test-db-id))
  ;; startup test web server
  (core/start-jetty)
  ;; start the task runner
  (task/start-task-runner!))


(defn test-teardown
  {:expectations-options :after-run}
  []
  (log/info "Shutting down Metabase unit test runner")
  (task/stop-task-runner!)
  (core/stop-jetty))


;; ## DB Setup
;; WARNING: BY RUNNING ANY UNIT TESTS THAT REQUIRE THIS FILE OR BY RUNNING YOUR ENTIRE TEST SUITE YOU WILL EFFECTIVELY BE WIPING OUT YOUR DATABASE.
;; SETUP-DB DELETES YOUR DATABASE FILE, AND GETS RAN AUTOMATICALLY BY EXPECTATIONS. USE AT YOUR OWN RISK!

(defn- clear-test-db
  "Delete the test db file if it's still lying around."
  []
  (let [filename (-> (re-find #"file:(\w+\.db).*" (db/db-file)) second)] ; db-file is prefixed with "file:", so we strip that off
    (map (fn [file-extension]                                         ; delete the database files, e.g. `metabase.db.h2.db`, `metabase.db.trace.db`, etc.
           (let [file (str filename file-extension)]
             (when (.exists (io/file file))
               (io/delete-file file))))
         [".h2.db"
          ".trace.db"
          ".lock.db"])))

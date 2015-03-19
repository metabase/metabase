(ns metabase.test-setup
  "Functions that run before + after unit tests (setup DB, start web server, load test data)."
  (:require [clojure.java.io :as io]
            [clojure.tools.logging :as log]
            [expectations :refer :all]
            (metabase [core :as core]
                      [db :as db]
                      [test-data :refer :all])))

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
  (clear-test-db)
  ;; setup the db and migrate up to current schema
  (db/setup-db :auto-migrate true)
  ;; this causes the test data to be loaded
  @test-db
  ;; startup test web server
  (core/start-jetty))


(defn test-teardown
  {:expectations-options :after-run}
  []
  (log/info "Shutting down Metabase unit test runner")
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

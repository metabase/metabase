(ns metabase.test-utils
  (:require [clojure.java.io :as io]
            [clojure.tools.logging :as log]
            [expectations :refer :all]
            [ring.adapter.jetty :as ring]
            (metabase [core :as core]
                      [db :refer :all]
                      [test-data :refer :all])))

(declare load-test-data
         setup-test-db
         start-jetty)

;; # SETTINGS

;; Don't run unit tests whenever JVM shuts down
;; it's pretty annoying to have our DB reset all the time
(expectations/disable-run-on-shutdown)


;; # FUNCTIONS THAT GET RUN ON TEST SUITE START / STOP

(defn test-setup
  {:expectations-options :before-run}
  []
  ;; Disable debug logging since it clutters up our output
  (.setLevel (org.apache.log4j.Logger/getLogger "metabase") org.apache.log4j.Level/INFO)
  (setup-test-db)
  (load-test-data)
  (start-jetty))

;; ## DB Setup
;; WARNING: BY RUNNING ANY UNIT TESTS THAT REQUIRE THIS FILE OR BY RUNNING YOUR ENTIRE TEST SUITE YOU WILL EFFECTIVELY BE WIPING OUT YOUR DATABASE.
;; SETUP-DB DELETES YOUR DATABASE FILE, AND GETS RAN AUTOMATICALLY BY EXPECTATIONS. USE AT YOUR OWN RISK!

(defn- setup-test-db
  "Setup database schema."
  []
  (let [filename (-> (re-find #"file:(\w+\.db).*" (db-file)) second)] ; db-file is prefixed with "file:", so we strip that off
    (map (fn [file-extension]                                         ; delete the database files, e.g. `metabase.db.h2.db`, `metabase.db.trace.db`, etc.
           (let [file (str filename file-extension)]
             (when (.exists (io/file file))
               (io/delete-file file))))
         [".h2.db"
          ".trace.db"
          ".lock.db"]))
  (log/info "tearing down database and resetting to empty schema")
  (migrate (setup-jdbc-db) :down)
  (log/info "setting up database and running all migrations")
  (setup-db :auto-migrate true)
  (log/info "database setup complete"))

(defn- load-test-data []
  @test-db)


;; ## Jetty (Web) Server


(def ^:private jetty-instance
  (atom nil))

(defn- start-jetty
  "Start the Jetty web server."
  []
  (log/info "STARTING THE JETTY SERVER...")
  (when-not @jetty-instance
    (try (->> (ring/run-jetty core/app {:port 3000
                                        :join? false}) ; detach the thread
              (reset! jetty-instance))
        (catch java.net.BindException e                ; assume server is already running if port's already bound
          (log/warn "ALREADY RUNNING!")))))            ; e.g. if someone is running `lein ring server` locally. Tests should still work normally.

(defn stop-jetty
  "Stop the Jetty web server."
  {:expectations-options :after-run}
  []
  (when @jetty-instance
    (.stop ^org.eclipse.jetty.server.Server @jetty-instance)
    (reset! jetty-instance nil)))

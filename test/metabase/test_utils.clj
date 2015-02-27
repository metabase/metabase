(ns metabase.test-utils
  (:require [clojure.java.io :as io]
            [clojure.tools.logging :as log]
            [ring.adapter.jetty :as ring]
            [metabase.db :refer :all]
            [metabase.core :as core]
            [expectations :refer :all]))


(defn setup-db
  "setup database schema"
  {:expectations-options :before-run}
  []
  (let [filename (-> (re-find #"file:(\w+\.db).*" db-file) second)] ; db-file is prefixed with "file:", so we strip that off
    (map (fn [file-extension]                                        ; delete the database files, e.g. `metabase.db.h2.db`, `metabase.db.trace.db`, etc.
           (let [file (str filename file-extension)]
             (when (.exists (io/file file))
               (io/delete-file file))))
         [".h2.db"
          ".trace.db"
          ".lock.db"]))
  ; TODO - lets just completely delete the db before each test to ensure we start fresh
  (log/info "tearing down database and resetting to empty schema")
  (migrate :down)
  (log/info "setting up database and running all migrations")
  (migrate :up)
  (log/info "database setup complete"))

(def ^:private jetty-instance
  (delay
   (try (ring/run-jetty core/app {:port 3000
                                  :join? false}) ; detach the thread
        (catch java.net.BindException e          ; assume server is already running if port's already bound
          (println "ALREADY RUNNING!")))))       ; e.g. if someone is running `lein ring server` locally. Tests should still work normally.

(defn start-jetty
  "Start the Jetty web server."
  {:expectations-options :before-run}
  []
  (println "STARTING THE JETTY SERVER...")
  @jetty-instance)

(defn stop-jetty
  "Stop the Jetty web server."
  {:expectations-options :after-run}
  []
  (when @jetty-instance
    (.stop ^org.eclipse.jetty.server.Server @jetty-instance)))

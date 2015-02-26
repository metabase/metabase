(ns metabase.test-utils
  (:require [clojure.java.io :as io]
            [clojure.tools.logging :as log]
            [metabase.db :refer :all]
            [expectations :refer :all]))


(defn setup-db
  "setup database schema"
  {:expectations-options :before-run}
  []
  (println "Uh oh! We're here :'(")
  (let [filename (-> (re-find #"file:(\w+\.db).*" db-file) second) ; db-file is prefixed with "file:", so we strip that off
        h2-file (str filename ".h2.db")
        trace-file (str filename ".trace.db")]
    (when (.exists (io/file h2-file)) (io/delete-file h2-file))
    (when (.exists (io/file trace-file)) (io/delete-file trace-file)))
  ; TODO - lets just completely delete the db before each test to ensure we start fresh
  (log/info "tearing down database and resetting to empty schema")
  (migrate :down)
  (log/info "setting up database and running all migrations")
  (migrate :up)
  (log/info "database setup complete"))

(ns metabase.test-utils
  (:require [clojure.tools.logging :as log]
            [metabase.db :refer :all]
            [expectations :refer :all]))


(defn setup-db
  "setup database schema"
  {:expectations-options :before-run}
  []
  ; TODO - lets just completely delete the db before each test to ensure we start fresh
  (log/info "tearing down database and resetting to empty schema")
  (migrate :down)
  (log/info "setting up database and running all migrations")
  (migrate :up)
  (log/info "database setup complete"))
(ns metabase.driver.generic-sql.connection
  (:require [clojure.tools.logging :as log]
            [korma.core :as k]
            [metabase.driver :as driver]))

(defn test-connection
  "Test whether we can performa a very simple SQL query against CONNECTION.
   (This will probably throw an Exception if we cannot).

    (test-connection (korma.db/postgres {:db \"metabase\", :port 5432, ...})) -> true"
  [connection]
  (= 1 (-> (k/exec-raw connection "SELECT 1" :results)
           first
           vals
           first)))

(defn can-connect?
  "Check whether we can connect to a DATABASE and perform a very simple SQL query.

    (can-connect? (sel :one Database ....)) -> true"
  [database]
  (try (test-connection (driver/connection database))
       (catch Throwable e
         (log/error "Failed to connect to database:" (.getMessage e))
         false)))

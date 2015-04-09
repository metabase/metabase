(ns metabase.driver.generic-sql.connection
  (:require [clojure.tools.logging :as log]
            [korma.core :as k]
            [metabase.driver :as driver]))

(defn can-connect?
  "Check whether we can connect to a DATABASE and perform a very simple SQL query.

    (can-connect? (sel :one Database ....)) -> true"
  [database]
  (try (= 1 (-> (k/exec-raw (driver/connection database) "SELECT 1" :results)
                first
                vals
                first))
       (catch Throwable e
         (log/error "Failed to connect to database:" (.getMessage e))
         false)))

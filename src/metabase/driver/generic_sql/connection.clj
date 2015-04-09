(ns metabase.driver.generic-sql.connection
  (:require [korma.core :as k]
            [metabase.driver :refer [connection]]))

(defn can-connect?
  "Check whether we can connect to a DATABASE and perform a very simple SQL query.

    (can-connect? (sel :one Database ....)) -> true"
  [database]
  (try (= (-> (k/exec-raw (connection database)
                          "SELECT 1 AS ONE"
                          :results)
              first
              :one) 1)
       (catch Throwable _
         false)))

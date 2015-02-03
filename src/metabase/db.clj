(ns metabase.db
  (:require [clojure.tools.logging :as log]
            [environ.core :refer [env]]
            [korma.core :refer :all]
            [korma.db :refer :all]
            [metabase.config :refer [app-defaults]]))


(defn get-db-file
  "Check config/environment to determine the path to the h2 db file we want to use"
  []
  (or (env :database-file) (get app-defaults :database-file)))


(defdb db (do
            (log/info (str "Using H2 database file: " (get-db-file)))
            (h2 {:db (get-db-file)})))

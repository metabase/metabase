(ns metabase.test.initialize.db
  (:require [metabase.db :as mdb]))

(defn init! []
  (println (format "Setting up %s test DB and running migrations..." (mdb/db-type)))
  (mdb/setup-db!))

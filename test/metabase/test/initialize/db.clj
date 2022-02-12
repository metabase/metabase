(ns metabase.test.initialize.db
  (:require [metabase.db :as mdb]
            [metabase.task :as task]
            [metabase.util :as u]))

(comment mdb/keep-me)

(defn init! []
  (println (u/format-color 'blue "Setting up %s test DB and running migrations..." (mdb/db-type)))
  (#'task/set-jdbc-backend-properties!)
  ;; nothing else to do. Just by loading [[metabase.db]] the Toucan connection info is set up.
  nil)

(ns metabase.api.testing
  "Endpoints for testing."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [compojure.core :refer [POST]]
            [metabase.api.common :as api]
            [metabase.models.setting.cache :as cache]
            [toucan.db :as db]))

(defn- snapshot-path-for-name
  [snapshot-name]
  (str "frontend/test/snapshots/" (str/replace snapshot-name #"\W" "_") ".sql"))

(api/defendpoint POST "/snapshot/:name"
  "Snapshot the database for testing purposes."
  [name]
  (jdbc/query (db/connection) ["SCRIPT TO ?" (snapshot-path-for-name name)])
  nil)

(api/defendpoint POST "/restore/:name"
  "Restore a database snapshot for testing purposes."
  [name]
  (jdbc/execute! (db/connection) ["DROP ALL OBJECTS"])
  (jdbc/execute! (db/connection) ["RUNSCRIPT FROM ?" (snapshot-path-for-name name)])
  (cache/restore-cache!)
  nil)

(api/define-routes)

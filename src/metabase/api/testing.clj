(ns metabase.api.testing
  "Endpoints for testing."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [compojure.core :refer [POST]]
            [metabase.api.common :as api]
            [metabase.api.setup :as api.setup]
            [metabase.models.setting.cache :as setting.cache]
            [toucan.db :as db]))

(defn- snapshot-path-for-name
  ^String [snapshot-name]
  (str "frontend/test/snapshots/" (str/replace (name snapshot-name) #"\W" "_") ".sql"))

(defn- save-snapshot! [snapshot-name]
  (let [path (snapshot-path-for-name snapshot-name)]
    (log/infof "Saving snapshot to %s" path)
    (jdbc/query (db/connection) ["SCRIPT TO ?" path]))
  :ok)

(defn- restore-snapshot! [snapshot-name]
  (let [path (snapshot-path-for-name snapshot-name)]
    (log/infof "Restoring snapshot from %s" path)
    (api/check-404 (.exists (java.io.File. path)))
    (with-open [conn (jdbc/get-connection (db/connection))]
      (let [conn-spec {:connection conn}]
        (jdbc/execute! conn-spec ["SET LOCK_TIMEOUT 180000"])
        (jdbc/execute! conn-spec ["DROP ALL OBJECTS"])
        (jdbc/execute! conn-spec ["RUNSCRIPT FROM ?" path]))))
  (setting.cache/restore-cache!)
  :ok)

(api/defendpoint POST "/snapshot/:name"
  "Snapshot the database for testing purposes."
  [name]
  (save-snapshot! name)
  nil)

(api/defendpoint POST "/restore/:name"
  "Restore a database snapshot for testing purposes."
  [name]
  (restore-snapshot! name)
  nil)

(api/defendpoint GET "/save-site-url"
  "Save site-url from headers. This is performed automatically on POST `api/setup/` but testing needs this value to be
  set in workflows where we do not post to this endpoint yet."
  [:as request]
  (#'api.setup/maybe-set-site-url (:headers request))
  api/generic-204-no-content)

(api/define-routes)

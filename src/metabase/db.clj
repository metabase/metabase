(ns metabase.db
  "Korma database definition and helper functions for interacting with the database."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            [clojure.string :as str]
            [environ.core :refer [env]]
            [korma.core :refer :all]
            [korma.db :refer :all]
            [metabase.config :refer [app-defaults]]))


(defn get-db-file
  "Check config/environment to determine the path to the h2 db file we want to use"
  []
  (str "file:" (or (env :database-file) (get app-defaults :database-file))))


(defdb db (do
            (log/info (str "Using H2 database file: " (get-db-file)))
            (h2 {:db (get-db-file)
                 :naming {:keys str/lower-case
                          :fields str/upper-case}})))

(defn migrate
  "Migrate the database :up or :down."
  [direction]
  (let [conn (jdbc/get-connection {:subprotocol "h2"
                                   :subname (get-db-file)})]
    (case direction
      :up (com.metabase.corvus.migrations.LiquibaseMigrations/setupDatabase conn)
      :down (com.metabase.corvus.migrations.LiquibaseMigrations/teardownDatabase conn))))

;;; UTILITY FUNCTIONS

(defn ins
  "Wrapper around `korma.core/insert` that renames the `:scope_identity()` keyword in output to `:id`
   and automatically passes &rest KWARGS to `korma.core/values`."
  [entity & kwargs]
  (-> (insert entity (values (apply assoc {} kwargs)))
      (clojure.set/rename-keys {(keyword "scope_identity()") :id})))

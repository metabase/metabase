(ns metabase.sample-data
  (:require [clojure.java.io :as io]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase.config :as config]
            [metabase.models.database :refer [Database]]
            [metabase.sync :as sync]
            [metabase.util.i18n :refer [trs]]
            [toucan.db :as db]))

(def ^:private ^String sample-database-name     "Sample Database")
(def ^:private ^String sample-database-filename "sample-database.db.mv.db")

(defn- db-details []
  (let [resource (io/resource sample-database-filename)]
    (when-not resource
      (throw (Exception. (trs "Sample database DB file ''{0}'' cannot be found."
                              sample-database-filename))))
    {:db (-> (.getPath resource)
             (str/replace #"^file:" "zip:") ; to connect to an H2 DB inside a JAR just replace file: with zip: (this doesn't do anything when running from the Clojure CLI, which has no `file:` prefix)
             (str/replace #"\.mv\.db$" "")  ; strip the .mv.db suffix from the path
             (str/replace #"%20" " ") ; for some reason the path can get URL-encoded and replace spaces with `%20`; this breaks things so switch them back to spaces
             (str ";USER=GUEST;PASSWORD=guest"))})) ; specify the GUEST user account created for the DB

(defn- sync-sample-database!
  [db]
  (if config/is-test?
    ;; In test, do sample DB synchronously to ensure that it is fully synced before tests run
    (sync/sync-database! db {:scan :full})
    (do
      ;; In dev & prod, spin off a separate thread for analyze + field values steps so that we don't
      ;; block startup.
      (sync/sync-database! db {:scan :schema})
      (future (sync/sync-database! db {:scan [:analyze :field-values]})))))

(defn add-sample-database!
  "Add the sample database as a Metabase DB if it doesn't already exist. Only a metadata sync is done synchronously
  when running in prod in order reduce startup time."
  []
  (when-not (db/exists? Database :is_sample true)
    (try
      (log/info (trs "Loading sample database"))
      (let [db (db/insert! Database
                           :name      sample-database-name
                           :details   (db-details)
                           :engine    :h2
                           :is_sample true)]
        (sync-sample-database! db))
      (catch Throwable e
        (log/error e (trs "Failed to load sample database"))))))

(defn update-sample-database-if-needed!
  "Update the path to the sample database DB if it exists in case the JAR has moved."
  []
  (when-let [sample-db (db/select-one Database :is_sample true)]
    (let [intended (db-details)]
      (when (not= (:details sample-db) intended)
        (db/update! Database (:id sample-db) :details intended)))))

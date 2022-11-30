(ns metabase.sample-data
  (:require [clojure.java.io :as io]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase.models.database :refer [Database]]
            [metabase.plugins :as plugins]
            [metabase.sync :as sync]
            [metabase.util.files :as u.files]
            [metabase.util.i18n :refer [trs]]
            [toucan.db :as db]))

(def ^:private ^String sample-database-name     "Sample Database")
(def ^:private ^String sample-database-filename "sample-database.db.mv.db")

;; Reuse the plugins directory for the destination to extract the sample database because it's pretty much guaranteed
;; to exist and be writable.
(def ^:private target-path (u.files/append-to-path (plugins/plugins-dir) sample-database-filename))

(defn- extract-sample-database!
  []
  (u.files/with-open-path-to-resource [sample-db-path sample-database-filename]
    (u.files/copy-file! sample-db-path target-path)))

(defn- jar-db-details
  [resource]
  (-> (.getPath resource)
      (str/replace #"^file:" "zip:") ; to connect to an H2 DB inside a JAR just replace file: with zip: (this doesn't do anything when running from the Clojure CLI, which has no `file:` prefix)
      (str/replace #"\.mv\.db$" "")  ; strip the .mv.db suffix from the path
      (str/replace #"%20" " ") ; for some reason the path can get URL-encoded and replace spaces with `%20`; this breaks things so switch them back to spaces
      (str ";USER=GUEST;PASSWORD=guest")))

(defn- db-details []
  (let [resource (io/resource sample-database-filename)]
    (when-not resource
      (throw (Exception. (trs "Sample database DB file ''{0}'' cannot be found."
                              sample-database-filename))))
    {:db
     (try
       (extract-sample-database!)
       (-> (str "file:" (u.files/append-to-path (plugins/plugins-dir) sample-database-filename))
           (str/replace #"\.mv\.db$" "")  ; strip the .mv.db suffix from the path
           (str/replace #"%20" " ") ; for some reason the path can get URL-encoded and replace spaces with `%20`; this breaks things so switch them back to spaces
           (str ";USER=GUEST;PASSWORD=guest"))
       (catch Exception _
        (jar-db-details resource)))})) ; specify the GUEST user account created for the DB

(defn add-sample-database!
  "Add the sample database as a Metabase DB if it doesn't already exist."
  []
  (when-not (db/exists? Database :is_sample true)
    (try
      (log/info (trs "Loading sample database"))
      (sync/sync-database! (db/insert! Database
                             :name      sample-database-name
                             :details   (db-details)
                             :engine    :h2
                             :is_sample true))
      (catch Throwable e
        (log/error e (trs "Failed to load sample database"))))))

(defn update-sample-database-if-needed!
  "Update the path to the sample database DB if it exists in case the JAR has moved."
  []
  (when-let [sample-db (db/select-one Database :is_sample true)]
    (let [intended (db-details)]
      (when (not= (:details sample-db) intended)
        (db/update! Database (:id sample-db) :details intended)))))

(ns metabase.sample-data
  (:require [clojure.java.io :as io]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase.models.database :refer [Database]]
            [metabase.sync :as sync]
            [metabase.util.i18n :refer [trs]]
            [toucan.db :as db]))

(def ^:private ^String sample-dataset-name     "Sample Dataset")
(def ^:private ^String sample-dataset-filename "sample-dataset.db.mv.db")

(defn- db-details []
  (let [resource (io/resource sample-dataset-filename)]
    (when-not resource
      (throw (Exception. (trs "Sample dataset DB file ''{0}'' cannot be found."
                              sample-dataset-filename))))
    {:db (-> (.getPath resource)
             (str/replace #"^file:" "zip:") ; to connect to an H2 DB inside a JAR just replace file: with zip: (this doesn't do anything when running from `lein`, which has no `file:` prefix)
             (str/replace #"\.mv\.db$" "")  ; strip the .mv.db suffix from the path
             (str/replace #"%20" " ") ; for some reason the path can get URL-encoded and replace spaces with `%20`; this breaks things so switch them back to spaces
             (str ";USER=GUEST;PASSWORD=guest"))})) ; specify the GUEST user account created for the DB

(defn add-sample-dataset!
  "Add the sample dataset as a Metabase DB if it doesn't already exist."
  []
  (when-not (db/exists? Database :is_sample true)
    (try
      (log/info (trs "Loading sample dataset..."))
      (sync/sync-database! (db/insert! Database
                             :name      sample-dataset-name
                             :details   (db-details)
                             :engine    :h2
                             :is_sample true))
      (catch Throwable e
        (log/error e (trs "Failed to load sample dataset"))))))

(defn update-sample-dataset-if-needed!
  "Update the path to the sample dataset DB if it exists in case the JAR has moved."
  []
  (when-let [db (Database :is_sample true)]
    (db/update! Database (:id db)
      :details (db-details))))

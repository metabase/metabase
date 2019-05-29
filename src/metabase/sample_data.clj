(ns metabase.sample-data
  (:require [clojure.java.io :as io]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase.models.database :refer [Database]]
            [metabase.sync :as sync]
            [metabase.util.i18n :refer [trs]]
            [toucan.db :as db])
  (:import java.net.URL))

(def ^:private ^String sample-dataset-name     "Sample Dataset")
(def ^:private ^String sample-dataset-filename "sample-dataset.db.mv.db")

(defn- jdbc-connection-file-url [^URL file-url]
  (-> (.getPath file-url)
      ;; to connect to an H2 DB inside a JAR just replace file: with zip: (this doesn't do anything when
      ;; running from `lein`, which has no `file:` prefix)
      (str/replace #"^file:" "zip:")
      ;; strip the .mv.db suffix from the path
      (str/replace #"\.mv\.db$" "")
      ;; for some reason the path can get URL-encoded and replace spaces with `%20`; this breaks things so
      ;; switch them back to spaces
      (str/replace #"%20" " ")))

(defn- db-details []
  (let [resource (or (io/resource sample-dataset-filename)
                     (throw (Exception. (str (trs "Can''t load sample dataset: the DB file ''{0}'' can't be found."
                                                  sample-dataset-filename)))))]
    {:db       (jdbc-connection-file-url resource)
     ;; specify the GUEST user account created for the DB
     :USER     "GUEST"
     :PASSWORD "guest"}))

(defn add-sample-dataset!
  "Add the sample dataset as a Metabase DB if it doesn't already exist."
  []
  (when-not (db/exists? Database :is_sample true)
    (try
      (log/info "Loading sample dataset...")
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

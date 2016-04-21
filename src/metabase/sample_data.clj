(ns metabase.sample-data
  (:require [clojure.java.io :as io]
            [clojure.string :as s]
            [clojure.tools.logging :as log]
            [metabase.db :as db]
            [metabase.models.database :refer [Database]]
            [metabase.sync-database :as sync-database]
            [metabase.util :as u]))


(def ^:private ^:const sample-dataset-name     "Sample Dataset")
(def ^:private ^:const sample-dataset-filename "sample-dataset.db.mv.db")

(defn add-sample-dataset! []
  (when-not (db/sel :one Database :is_sample true)
    (try
      (log/info "Loading sample dataset...")
      (let [resource (io/resource sample-dataset-filename)]
        (if-not resource
          (log/error (u/format-color 'red "Can't load sample dataset: the DB file '%s' can't be found." sample-dataset-filename))
          (let [h2-file (-> (.getPath resource)
                            (s/replace #"^file:" "zip:")        ; to connect to an H2 DB inside a JAR just replace file: with zip:
                            (s/replace #"\.mv\.db$" "")         ; strip the .mv.db suffix from the path
                            (str ";USER=GUEST;PASSWORD=guest")) ; specify the GUEST user account created for the DB
                db      (db/ins Database
                                :name      sample-dataset-name
                                :details   {:db h2-file}
                                :engine    :h2
                                :is_sample true)]
            (sync-database/sync-database! db))))
      (catch Throwable e
        (log/error (u/format-color 'red "Failed to load sample dataset: %s" (.getMessage e)))))))

(defn update-sample-dataset-if-needed! []
  ;; TODO - it would be a bit nicer if we skipped this when the data hasn't changed
  (when-let [db (db/sel :one Database :is_sample true)]
    (try
      (sync-database/sync-database! db)
      (catch Throwable e
        (log/error (u/format-color 'red "Failed to update sample dataset: %s" (.getMessage e)))))))

(ns metabase.sample-data
  (:require [clojure.java.io :as io]
            [clojure.string :as s]
            [clojure.tools.logging :as log]
            [metabase.db :as db]
            [metabase.driver :as driver]
            (metabase.models [setting :refer [defsetting]]
                             [database :refer [Database]])))


(def ^:const sample-dataset-name "Sample Dataset")
(def ^:const sample-dataset-filename "sample-dataset.db.mv.db")

(defsetting sample-dataset-id
  "The string-serialized integer ID of the `Database` entry for the Sample Dataset. If this is `nil`, the Sample Dataset
   hasn't been loaded yet, and we should do so; otherwise we've already loaded it, and should not do so again. Keep in
   mind the user may delete the Sample Dataset's DB, so this ID is not guaranteed to correspond to an existent object."
  nil
  :internal true) ; don't expose in the UI

(defn add-sample-dataset! []
  (when-not (sample-dataset-id)
    (try
      (log/info "Loading sample dataset...")
      (let [resource (io/resource sample-dataset-filename)]
        (if-not resource
          (log/error (format "Can't load sample dataset: the DB file '%s' can't be found." sample-dataset-filename))
          (let [h2-file (-> (.getPath resource)
                            (s/replace #"^file:" "zip:")        ; to connect to an H2 DB inside a JAR just replace file: with zip:
                            (s/replace #"\.mv\.db$" "")         ; strip the .mv.db suffix from the path
                            (str ";USER=GUEST;PASSWORD=guest")) ; specify the GUEST user account created for the DB
                db      (db/ins Database
                                :name    sample-dataset-name
                                :details {:db h2-file}
                                :engine  :h2)]
            (driver/sync-database! db)
            (sample-dataset-id (str (:id db))))))
      (catch Throwable e
        (log/error (format "Failed to load sample dataset: %s" (.getMessage e)))))))

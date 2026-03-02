(ns metabase.release-flags.init
  (:require
   [clojure.edn :as edn]
   [clojure.set :as set]
   [metabase.release-flags.models :as models]
   [metabase.task.core :as task]
   [metabase.util.log :as log])
  (:import
   (java.time LocalDate)))

(set! *warn-on-reflection* true)

(defn- read-flags-file
  "Reads the release flags EDN config and returns the flag map."
  []
  (try
    (:metabase/release-flags
     (edn/read-string (slurp ".clj-kondo/config/release-flags/config.edn")))
    (catch Exception e
      (log/warn e "Could not read .clj-kondo/config/release-flags/config.edn")
      {})))

(defn sync-flags-from-file!
  "Syncs the release_flag table with the release flags EDN config.
   Inserts any flags from the file that are missing from the table.
   Deletes any flags from the table that are not in the file.
   Existing flags are updated with the description and start_date from the file."
  []
  (let [file-flags  (read-flags-file)
        file-keys   (set (keys file-flags))
        db-keys     (set (map name (keys (models/all-flags))))]
    ;; Delete flags not in the file
    (let [to-delete (set/difference db-keys file-keys)]
      (when (seq to-delete)
        (log/info "Deleting release flags not in file:" to-delete)
        (models/delete-flags! to-delete)))
    ;; Upsert flags from the file
    (doseq [[flag-name data] file-flags]
      (models/upsert-flag! flag-name
                           (:description data)
                           (LocalDate/parse (:start-date data))))))

(defmethod task/init! ::ReleaseFlagSync [_]
  (log/info "Syncing release flags from EDN config")
  (sync-flags-from-file!))

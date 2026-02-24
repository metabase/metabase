(ns metabase.release-flags.init
  (:require
   [clojure.set :as set]
   [metabase.release-flags.models :as models]
   [metabase.task.core :as task]
   [metabase.util.json :as json]
   [metabase.util.log :as log])
  (:import
   (java.time LocalDate)))

(set! *warn-on-reflection* true)

(defn- read-flags-file
  "Reads release-flags.json from the project root and returns a map of flag name to {:description :start_date}."
  []
  (try
    (-> (slurp "release-flags.json")
        (json/decode+kw))
    (catch Exception e
      (log/warn e "Could not read release-flags.json")
      {})))

(defn sync-flags-from-file!
  "Syncs the release_flag table with the contents of release-flags.json.
   Inserts any flags from the file that are missing from the table.
   Deletes any flags from the table that are not in the file.
   Existing flags are updated with the description and start_date from the file."
  []
  (let [file-flags  (read-flags-file)
        file-keys   (set (map name (keys file-flags)))
        db-keys     (set (map name (keys (models/all-flags))))]
    ;; Delete flags not in the file
    (let [to-delete (set/difference db-keys file-keys)]
      (when (seq to-delete)
        (log/info "Deleting release flags not in file:" to-delete)
        (models/delete-flags! to-delete)))
    ;; Upsert flags from the file
    (doseq [[flag-kw data] file-flags
            :let [flag-name (name flag-kw)]]
      (models/upsert-flag! flag-name
                           (:description data)
                           (LocalDate/parse (:startDate data))))))

(defmethod task/init! ::ReleaseFlagSync [_]
  (log/info "Syncing release flags with release-flags.json file")
  (sync-flags-from-file!))

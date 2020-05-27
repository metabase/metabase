(ns metabase.cmd.refresh-integration-test-db-metadata
  (:require [clojure.java.io :as io]
            [environ.core :refer [env]]
            [metabase
             [db :as mdb]
             [sample-data :as sample-data]
             [sync :as sync]]
            [metabase.models
             [database :refer [Database]]
             [field :refer [Field]]]
            [toucan.db :as db]))

(defn- test-fixture-db-path
  "Get the path to the test fixture DB that we'll use for `MB_DB_FILE`. Throw an Exception if the file doesn't exist."
  []
  (let [path (str (System/getProperty "user.dir") "/frontend/test/__runner__/test_db_fixture.db")]
    (when-not (or (.exists (io/file (str path ".h2.db")))
                  (.exists (io/file (str path ".mv.db"))))
      (throw (Exception. (str "Could not find frontend integration test DB at path: " path ".h2.db (or .mv.db)"))))
    path))

(defn ^:command refresh-integration-test-db-metadata
  "Re-sync the frontend integration test DB's metadata for the Sample Dataset."
  []
  (let [db-path (test-fixture-db-path)]
    ;; now set the path at MB_DB_FILE
    (alter-var-root #'environ.core/env assoc :mb-db-type "h2", :mb-db-file db-path)
    ;; set up the DB, make sure sample dataset is added
    (mdb/setup-db!)
    (sample-data/add-sample-dataset!)
    (sample-data/update-sample-dataset-if-needed!)
    ;; clear out all Fingerprints so we force analysis to run again. Clear out special type and has_field_values as
    ;; well so we can be sure those will be set to the correct values
    (db/debug-print-queries
      (db/update! Field {:set {:fingerprint_version 0
                               :special_type        nil
                               :has_field_values    nil
                               :fk_target_field_id  nil}}))
    ;; now re-run sync
    (sync/sync-database! (Database :is_sample true))
    ;; done!
    (println "Finished.")))

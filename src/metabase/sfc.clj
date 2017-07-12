(ns metabase.sfc
  "Functions for running the entire SFC (Sync-Fingerprint-Classify) process from start to finish."
  (:require [clojure.tools.logging :as log]
            [metabase.sfc
             [analyze :as analyze]
             [classify :as classify]
             [fingerprint :as fingerprint]
             [sync :as sync]]))

(defn sync-fingerprint-classify-table!
  "Run the entire SFC process for a TABLE *synchronously*."
  [table]
  (sync/sync-table!                          table)
  (fingerprint/cache-field-values-for-table! table)
  (analyze/analyze-table-data-shape!         table)
  (classify/classify-table!                  table))

(defn sync-fingerprint-classify-table-async!
  "Run the entire SFC process for a TABLE asynchronously."
  [table]
  (future
    (try (sync-fingerprint-classify-table! table)
         (catch Throwable e
           (log/error (format "Error syncing Table: %d" (:id table))
                      (.getMessage e))))))


(defn- sync-fingerprint-classify-database! [database]
  (sync/sync-database!                          database)
  (fingerprint/cache-field-values-for-database! database)
  (analyze/analyze-database!                    database)
  (classify/classify-database!                  database))

(defn sync-fingerprint-classify-database-async!
  "Run the entire SFC process for a DATABASE asyncronously."
  [database]
  (future (try (sync-fingerprint-classify-database! database)
               (catch Throwable e
                 (log/error (format "Error syncing Database: %d" (:id database))
                            (.getMessage e))))))

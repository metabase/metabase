(ns metabase-enterprise.serialization.v2.load
  "Loading, the last step of an import: the entities an ingestion reads, loaded into the app DB in one transaction by
  [[metabase.serialization.core/load-all]], and its settings."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.serialization.settings :as serialization.settings]
   [metabase-enterprise.serialization.v2.ingest :as serdes.ingest]
   [metabase.search.core :as search]
   [metabase.serialization.core :as serialization]
   [metabase.settings.core :as setting]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- prepare-settings [settings continue-on-error]
  (reduce (fn [acc {:keys [key value]}]
            (let [key (keyword key)]
              (if (and continue-on-error (not (setting/registered? key)))
                (update acc :errors conj (ex-info "Unknown setting." {:key key}))
                (update acc :values conj [key (setting/import-setting-value key value)]))))
          {:errors [] :values []}
          settings))

(defn- load-settings! [settings continue-on-error]
  (into []
        (keep (fn [[key value]]
                (try
                  (setting/set! key value)
                  nil
                  (catch Exception e
                    (if continue-on-error
                      (ex-info (format "Failed to load Setting %s" key) {:key key} e)
                      (throw e))))))
        settings))

(defn- check-ingest-errors!
  "Throws when reading the files of the ingestion failed for any of `ingest-errors`."
  [ingest-errors]
  (when (seq ingest-errors)
    (let [file-names (mapv #(or (:file (ex-data %)) (ex-message %)) ingest-errors)]
      (throw (ex-info (format "Failed to read %d file(s) during ingestion: %s"
                              (count ingest-errors)
                              (str/join ", " file-names))
                      {:ingest-errors ingest-errors
                       :files         file-names}
                      (first ingest-errors))))))

(defn load-metabase!
  "Loads the entities of `ingestion`, any Ingestable, into the app DB, returning `{:seen keys :errors errors}`: the
  `[model ref]` keys it read, and with `continue-on-error` the errors of the files it could not read and the
  entities it could not load, which it leaves out."
  [ingestion & {:keys [continue-on-error reindex? allow-system?]
                :or   {continue-on-error false
                       reindex?          true}}]
  (let [ks                     (vec (serdes.ingest/ingest-list ingestion))
        ingest-errors          (serdes.ingest/ingest-errors ingestion)
        _                      (when-not continue-on-error (check-ingest-errors! ingest-errors))
        {settings true
         entities false}       (group-by #(= :model/Setting (first %)) ks)
        prepared-settings      (prepare-settings (into [] (keep second) (serdes.ingest/ingested ingestion settings))
                                                 continue-on-error)
        _                      (log/infof "Starting deserialization, total %s documents" (count ks))
        errors                 (into (serialization/load-all entities
                                                             #(serdes.ingest/ingest-many ingestion %)
                                                             :continue-on-error      continue-on-error
                                                             :allow-system?          allow-system?
                                                             :skip-schema-validation (serialization.settings/serialization-skip-schema-validation))
                                     (load-settings! (:values prepared-settings) continue-on-error))]
    (doseq [e errors]
      (log/warn (u/strip-error e "Skipping deserialization error")))
    (when reindex?
      (search/reindex!))
    {:seen   ks
     :errors (into (into (vec ingest-errors) (:errors prepared-settings)) errors)}))

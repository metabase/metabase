(ns metabase-enterprise.advanced-config.file.databases
  (:require
   [clojure.spec.alpha :as s]
   [metabase-enterprise.advanced-config.file.interface :as advanced-config.file.i]
   [metabase-enterprise.advanced-config.settings :as advanced-config.settings]
   [metabase.util.log :as log]
   [metabase.warehouses.core :as warehouses]))

(s/def :metabase-enterprise.advanced-config.file.databases.config-file-spec/name
  string?)

(s/def :metabase-enterprise.advanced-config.file.databases.config-file-spec/engine
  string?)

(s/def :metabase-enterprise.advanced-config.file.databases.config-file-spec/details
  map?)

(s/def :metabase-enterprise.advanced-config.file.databases.config-file-spec/is_stub
  boolean?)

(s/def :metabase-enterprise.advanced-config.file.databases.config-file-spec/is_sample
  boolean?)

(defn- valid-regex-patterns? [patterns]
  (every? (fn [pattern]
            (try
              (boolean (re-pattern pattern))
              (catch Exception e (log/error e) false)))
          patterns))

(s/def :metabase-enterprise.advanced-config.file.databases.config-file-spec/settings
  (s/and
   map?
   (fn cruft-patterns-are-valid? [settings]
     (->> [(:auto-cruft-tables settings
                               ;; we access auto.cruft.* with _'s here. Because we may expect to see underscores from
                               ;; the yaml file, this is validated first then normalized into kebab-case after
                               ;; validation in [[normalize-settings]].
                               (:auto_cruft_tables settings))
           (:auto-cruft-columns settings
                                (:auto_cruft_columns settings))]
          (remove nil?)
          (every? valid-regex-patterns?)))))

(s/def ::config-file-spec
  (s/keys :req-un [:metabase-enterprise.advanced-config.file.databases.config-file-spec/engine
                   :metabase-enterprise.advanced-config.file.databases.config-file-spec/name
                   :metabase-enterprise.advanced-config.file.databases.config-file-spec/details]
          :opt-un [:metabase-enterprise.advanced-config.file.databases.config-file-spec/settings
                   :metabase-enterprise.advanced-config.file.databases.config-file-spec/is_stub
                   :metabase-enterprise.advanced-config.file.databases.config-file-spec/is_sample]))

(defmethod advanced-config.file.i/section-spec :databases
  [_section]
  (s/spec (s/* ::config-file-spec)))

(defmethod advanced-config.file.i/initialize-section! :databases
  [_section-name databases]
  ;; Sync-on-create is gated on an advanced-config setting; pass it through to the
  ;; shared warehouses upsert (which is setting-agnostic).
  (let [sync? (boolean (advanced-config.settings/config-from-file-sync-databases))]
    (doseq [database databases]
      (warehouses/upsert-database-from-config! database {:sync? sync?}))))

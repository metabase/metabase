(ns metabase.jekyll-mode.load
  (:require
   [metabase-enterprise.serialization.v2.ingest :as v2.ingest]
   [metabase-enterprise.serialization.v2.load :as v2.load]
   [metabase.jekyll-mode.files :as files]
   [metabase.jekyll-mode.writeback :as writeback]
   [metabase.models.serialization :as serdes]
   [metabase.util.malli :as mu]
   [metabase.util.yaml :as u.yaml]))

(defn- file->serdes-path
  "Reads just enough of a serdes-exported YAML `file` to recover its `:serdes/meta` abstract path, without
  ingesting the whole export tree."
  [file]
  (-> file
      (u.yaml/from-file {:key-fn v2.ingest/parse-key})
      v2.ingest/read-timestamps
      serdes/path))

(defn- single-entity-ingestion
  "An [[v2.ingest/Ingestable]] whose `ingest-list` reports only `target-path`, so [[v2.load/load-metabase!]]
  loads just that one entity. `ingest-one` still delegates to a real ingestion rooted at `root-dir`, so any
  dependencies `target-path` needs (a Dashboard's Cards, its Collection, etc.) can still be read from disk."
  [root-dir target-path]
  (let [real (v2.ingest/ingest-yaml root-dir)]
    (reify v2.ingest/Ingestable
      (ingest-list [_] [target-path])
      (ingest-one [_ path] (v2.ingest/ingest-one real path))
      (ingest-errors [_] (v2.ingest/ingest-errors real)))))

(mu/defn load-instance-from-file! [filename :- :string]
  ;; avoid infinite loop: this load will trigger the after-update/insert writeback hooks, which would
  ;; otherwise write the file we just read right back out to disk.
  (binding [writeback/*suppress-file-updates* true]
    (let [root-dir    (files/directory-prefix)
          target-path (file->serdes-path filename)
          ingestion   (single-entity-ingestion root-dir target-path)]
      (v2.load/load-metabase! ingestion :reindex? false))))

(comment
  ;; path is whatever v2.storage.files/file-writer wrote under (files/directory-prefix), e.g.
  ;; "local/jekyll/collections/<slug>/dashboards/<slug>.yaml"
  (load-instance-from-file! "local/jekyll/collections/analytics/dashboards/my-dashboard.yaml"))

(ns metabase.jekyll-mode.load
  (:require
   [metabase-enterprise.serialization.core :as serialization]
   [metabase.jekyll-mode.files :as files]
   [metabase.jekyll-mode.writeback :as writeback]
   [metabase.models.serialization :as serdes]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.yaml :as u.yaml]))

(defn- file->serdes-path
  "Reads just enough of a serdes-exported YAML `file` to recover its `:serdes/meta` abstract path, without
  ingesting the whole export tree."
  [file]
  (-> file
      (u.yaml/from-file {:key-fn serialization/parse-key})
      serialization/read-timestamps
      serdes/path))

(defn- single-entity-ingestion
  "An [[serialization/Ingestable]] whose `ingest-list` reports only `target-path`, so [[serialization/load-metabase!]]
  loads just that one entity. `ingest-one` still delegates to a real ingestion rooted at `root-dir`, so any
  dependencies `target-path` needs (a Dashboard's Cards, its Collection, etc.) can still be read from disk."
  [root-dir target-path]
  (let [real (serialization/ingest-yaml root-dir)]
    (reify serialization/Ingestable
      (ingest-list [_] [target-path])
      (ingest-one [_ path] (serialization/ingest-one real path))
      (ingest-errors [_] (serialization/ingest-errors real)))))

(mu/defn load-instance-from-file! [filename :- :string]
  ;; avoid infinite loop: this load will trigger the after-update/insert writeback hooks, which would
  ;; otherwise write the file we just read right back out to disk.
  (binding [writeback/*suppress-file-updates* true]
    (let [root-dir    (files/directory-prefix)
          target-path (file->serdes-path filename)
          ingestion   (single-entity-ingestion root-dir target-path)]
      (serialization/load-metabase! ingestion :reindex? false))))

(defn import-all!
  "Loads everything currently serialized under the jekyll directory into the app DB.

  The file watcher only reports changes made while Metabase is running, so anything edited on disk while
  it was down stays invisible until that file happens to change again. A full import at startup closes
  that gap.

  Best-effort by design: these files are meant to be hand-edited, so one unparseable or unloadable file
  is logged and skipped rather than aborting the whole import. A missing or empty directory imports
  nothing and is not an error."
  []
  (let [root-dir (files/directory-prefix)]
    ;; avoid a write-back storm: every entity this loads would otherwise trip the after-update/insert
    ;; hooks and re-serialize itself straight back to the file it was just read from.
    (binding [writeback/*suppress-file-updates* true]
      (let [{:keys [seen errors]} (serialization/load-metabase! (serialization/ingest-yaml root-dir)
                                                                :continue-on-error true
                                                                :reindex?          false)]
        (doseq [e errors]
          (log/warn e "Jekyll mode: skipped a file during startup import"))
        (log/infof "Jekyll mode: startup import of %s loaded %d entities, skipped %d"
                   root-dir (count seen) (count errors))
        {:loaded (count seen), :skipped (count errors)}))))

(comment
  ;; path is whatever serialization/file-writer wrote under (files/directory-prefix), e.g.
  ;; "local/jekyll/collections/<slug>/dashboards/<slug>.yaml"
  (load-instance-from-file! "local/jekyll/collections/analytics/dashboards/my-dashboard.yaml"))

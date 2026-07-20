(ns metabase-enterprise.data-apps.sync
  "Materialize data apps from a synced repository snapshot.

   Data apps ride the remote-sync import pipeline: whenever remote-sync pulls the
   connected repository (manual \"Pull changes\", auto-import poll, or startup),
   it calls [[sync-from-snapshot!]] with the just-imported snapshot. We discover
   every `data_apps/<dir>/data_app.yaml` and materialize one `data_app` row per app
   (caching the built bundle). The connected repo is the source of truth: a sync
   upserts each app it finds and prunes rows whose directory is gone, so removing
   an app from the repo (or switching repos) drops it on the next sync. Unlinking
   runs no sync, so apps survive it.

   This namespace does no Git access of its own — the snapshot's `read-file` /
   `list-files` come from remote-sync. The cached `bundle` blob is what serving
   reads, so a failed sync never takes a working app offline, and the admin
   `enabled` toggle is preserved across syncs."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.data-apps.config :as data-app.config]
   [metabase.settings.core :as setting]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.security MessageDigest)
   (java.util.regex Pattern)
   (org.apache.commons.codec.binary Hex)))

(set! *warn-on-reflection* true)

(def ^:const max-bundle-bytes
  "Cap on a synced bundle's size (10 MiB)."
  (* 10 1024 1024))

(defn- bytes-hash ^String [^bytes b]
  (let [^MessageDigest md (MessageDigest/getInstance "SHA-256")]
    (Hex/encodeHexString ^bytes (.digest md b))))

(defn- ->bytes ^bytes [^String s]
  (.getBytes s "UTF-8"))

(defn repo-url
  "The connected remote-sync repository URL, or nil when none is configured. Read
   by keyword so this OSS namespace has no compile-time dependency on the
   enterprise remote-sync module; returns nil when that module (and its setting)
   isn't loaded."
  []
  (let [url (try (setting/get :remote-sync-url) (catch Throwable _ nil))]
    (when-not (str/blank? url)
      url)))

;;; ----------------------------------------------------- Discovery -----------------------------------------------------

(def ^:private app-dir-regex
  ;; the data_apps/<dir> folder a repo path sits in (dir = a single path segment)
  (re-pattern (format "(%s/[^/]+)/.*" (Pattern/quote data-app.config/apps-dir))))

(defn- discover-app-configs
  "Given the snapshot's `list-files` and `read-file` fns (where `read-file`
   returns file text or nil), iterate the folders under `data_apps/` and return one
   entry per folder that is an app — it holds a `data_app.yaml`; a folder without
   one is skipped. Each entry carries `:slug` (the directory name) plus either the
   parsed app `{:display_name :bundle :allowed_hosts}` (with `:bundle` the
   repo-root relative bundle path) or `{:config-error <message>}`. Parse/read
   failures are isolated per app so one bad config can't abort the sync — and the
   `:slug` is present either way, so pruning can tell a directory that still exists
   (transiently broken config) from one that was removed."
  [list-files read-file]
  (let [files    (set (list-files))
        app-dirs (distinct (keep #(second (re-matches app-dir-regex %)) files))]
    (for [dir  app-dirs
          :let [config-path (files (str dir "/data_app.yaml"))]
          :when config-path]
      (let [slug (data-app.config/dir-slug dir)]
        (try
          (if-let [content (read-file config-path)]
            (let [{:keys [display_name path allowed_hosts]} (data-app.config/parse-app-config (->bytes content) dir)]
              {:slug slug, :display_name display_name, :bundle (str dir "/" path), :allowed_hosts allowed_hosts})
            {:slug slug, :config-error (tru "Could not read {0}." config-path)})
          (catch Throwable e
            {:slug slug, :config-error (ex-message e)}))))))

;;; ----------------------------------------------------- Materialize -----------------------------------------------------

(defn- upsert-by-name!
  "Insert or update by slug. Never writes `:enabled`, so the admin toggle (and the
   DB default of true for new rows) is preserved across syncs."
  [slug row]
  (if (t2/exists? :model/DataApp :name slug)
    (t2/update! :model/DataApp :name slug row)
    (t2/insert! :model/DataApp (assoc row :name slug))))

(defn- app-content-changed?
  "Whether the just-synced content differs from the `existing` row (nil = a new
   app). Compares only content-bearing fields — a `last_synced_sha` /
   `last_synced_at` bump on an otherwise-identical app is NOT a change, so callers
   can count real changes (e.g. for the remote-sync pull summary)."
  [existing {:keys [display_name bundle_path bundle_hash allowed_hosts]}]
  (or (nil? existing)
      (some? (:sync_error existing))
      (not= (:display_name existing) display_name)
      (not= (:bundle_path existing) bundle_path)
      (not= (:bundle_hash existing) bundle_hash)
      (not= (vec (or (:allowed_hosts existing) []))
            (vec (or allowed_hosts [])))))

(defn- mark-config-error!
  "Record a `data_app.yaml` parse failure on an app that already has a row. The row
   and its cached bundle are kept — the directory is still in the repo, so this is a
   broken config, not a removal — but `sync_error` is set, so the admin UI shows the
   app as failed instead of silently presenting the last-good bundle as freshly
   synced. An app with no row yet simply isn't materialized (a brand-new app whose
   config never parsed has nothing to serve). Returns true when this changed the
   app's recorded state, so callers can count it like any other change."
  [existing slug message]
  (boolean
   (when (and existing (not= (:sync_error existing) message))
     (t2/update! :model/DataApp :name slug {:sync_error message})
     true)))

(defn- sync-app!
  "Materialize one app. On bundle failure, the row's metadata is still upserted
   with `sync_error` set so the app appears in the list with its failure; the
   previously cached bundle (if any) is kept. `existing` is the app's pre-sync row
   (or nil); returns true when this sync actually changed the app's content (a new
   app, differing bundle/metadata, or a new failure) so callers can count changes."
  [existing {:keys [slug display_name bundle sha read-file allowed_hosts]}]
  (try
    (let [content (read-file bundle)
          _       (when-not content
                    (throw (ex-info (tru "Bundle file \"{0}\" not found in the repository." bundle)
                                    {:status-code 400})))
          ^bytes bytes (->bytes content)]
      (when (> (alength bytes) max-bundle-bytes)
        (throw (ex-info (tru "Bundle for \"{0}\" must be less than {1} MiB."
                             slug (quot max-bundle-bytes (* 1024 1024)))
                        {:status-code 413})))
      (let [fields {:display_name  display_name
                    :allowed_hosts allowed_hosts
                    :bundle_path   bundle
                    :bundle_hash   (bytes-hash bytes)}]
        (upsert-by-name! slug (assoc fields
                                     :bundle          bytes
                                     :last_synced_sha sha
                                     :last_synced_at  :%now
                                     :sync_error      nil))
        (app-content-changed? existing fields)))
    (catch Throwable e
      (upsert-by-name! slug {:display_name  display_name
                             :allowed_hosts allowed_hosts
                             :bundle_path   bundle
                             :sync_error    (ex-message e)})
      (log/warnf e "[data-app] failed to sync app %s" slug)
      ;; a failing app counts as a change unless it was already failing identically
      (or (nil? existing) (not= (:sync_error existing) (ex-message e))))))

(defn import-from-snapshot!
  "Materialize data apps from a synced repo `snapshot`:

     {:read-file  (fn [path] -> <file-text-string> | nil)
      :list-files (fn [] -> [<path-string> ...])
      :sha        <commit-sha-string>}

   Discovers every `data_apps/<dir>/data_app.yaml`, upserts a row per app, and
   prunes rows whose directory is gone from the snapshot — all in a single
   transaction, so the connected repo is the source of truth for which apps exist.
   Returns `{:synced <n>, :changed <n>, :removed <n>, :sha <sha>,
   :config-errors [<message> ...]}`, where `:changed` is how many apps this sync
   actually created/updated (a `last_synced_sha` bump on an unchanged app does not
   count) and `:removed` is how many were deleted for no longer being in the repo.
   A malformed `data_app.yaml` is isolated (collected into `:config-errors`) rather
   than aborting the others: an app that already has a row is marked failed (see
   [[mark-config-error!]]), one that doesn't isn't materialized. Per-app bundle
   failures are likewise recorded on the row.

   Pruning is by *directory*, not by successful parse: an app whose directory is
   still present but whose config is momentarily broken is kept and marked with a
   `sync_error` (so the UI shows it as failed instead of serving the last-good
   bundle as if freshly synced), rather than being dropped along with its cached
   bundle. Deletion only happens here, on a successful snapshot read, so it
   never fires on a failed clone/fetch (that throws before we get a snapshot).
   Switching to a different repo therefore drops the previous repo's apps on the
   next sync (they're absent from the new snapshot); unlinking runs no sync, so
   apps survive it — matching how remote-sync treats other entities.

   Two apps can't collide on a slug here: a slug *is* an app's directory name (see
   the config namespace), a repo can't hold two `data_apps/<slug>` directories, and
   discovery takes one config per directory (see [[discover-app-configs]])."
  [{:keys [read-file list-files sha]}]
  ;; realize discovery once (it calls read-file/parse per config); `results` is
  ;; then walked several times below
  (let [results      (vec (discover-app-configs list-files read-file))
        good         (remove :config-error results)
        errors       (vec (keep :config-error results))
        ;; every app directory present in the repo (parsed or not) — the set of
        ;; slugs that should survive this sync
        present-slugs (into #{} (map :slug) results)
        ;; pre-sync rows, so we can tell a real change from a sha/timestamp bump
        existing     (into {} (map (juxt :name identity))
                           (t2/select [:model/DataApp :name :display_name :allowed_hosts
                                       :bundle_path :bundle_hash :sync_error]))
        {:keys [changed removed]}
        (t2/with-transaction [_conn]
          (let [changed (reduce (fn [n {:keys [slug config-error] :as cfg}]
                                  (cond-> n
                                    ;; A parse failure on an app that still exists marks
                                    ;; that row failed rather than syncing it; everything
                                    ;; else is materialized normally.
                                    (if config-error
                                      (mark-config-error! (get existing slug) slug config-error)
                                      (sync-app! (get existing slug)
                                                 (assoc cfg :sha sha :read-file read-file)))
                                    inc))
                                0 results)
                ;; The repo is the source of truth: drop rows whose directory is
                ;; gone. An empty repo (no `data_apps/`) removes them all. `enabled`
                ;; is ignored here — a locally disabled app removed from the repo is
                ;; still removed. (`[:not-in #{}]` is invalid SQL, so delete-all.)
                removed (if (seq present-slugs)
                          (t2/delete! :model/DataApp :name [:not-in present-slugs])
                          (t2/delete! :model/DataApp))]
            {:changed changed, :removed removed}))]
    (log/infof "[data-app] synced sha=%s apps=%d changed=%d removed=%d errors=%d"
               sha (count good) changed removed (count errors))
    {:synced (count good), :changed changed, :removed removed, :sha sha, :config-errors errors}))

(defn sync-from-snapshot!
  "Entry point for the remote-sync import pipeline. Materializes data apps from
   the just-imported `snapshot` (see [[import-from-snapshot!]] for its shape).
   Never throws, so it can't break the surrounding remote-sync import: a thrown
   failure is logged and swallowed, and a malformed `data_app.yaml` is logged and
   its app simply doesn't appear. Returns the [[import-from-snapshot!]] result, or
   nil if the sync threw."
  [snapshot]
  (try
    (let [{:keys [config-errors] :as result} (import-from-snapshot! snapshot)]
      (when (seq config-errors)
        (log/warnf "[data-app] %d data_app.yaml config(s) skipped: %s"
                   (count config-errors) (str/join "; " config-errors)))
      result)
    (catch Throwable e
      (log/warn e "[data-app] sync from remote-sync snapshot failed")
      nil)))

(ns metabase-enterprise.data-apps.sync
  "Materialize data apps from a synced repository snapshot.

   Data apps ride the remote-sync import pipeline: whenever remote-sync pulls the
   connected repository (manual \"Pull changes\", auto-import poll, or startup),
   it calls [[sync-from-snapshot!]] with the just-imported snapshot. We discover
   every `data_apps/<dir>/data_app.yml`, materialize one `data_app` row per app
   (caching the built bundle), and prune rows whose app directory is gone.

   This namespace does no Git access of its own — the snapshot's `read-file` /
   `list-files` come from remote-sync. The cached `bundle` blob is what serving
   reads, so a failed sync never takes a working app offline, and the admin
   `enabled` toggle is preserved across syncs."
  (:require
   [clojure.set :as set]
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
  "Cap on a synced bundle's size. 5 MiB matches the custom-viz cap."
  (* 5 1024 1024))

(defn- bytes-hash ^String [^bytes b]
  (let [^MessageDigest md (MessageDigest/getInstance "SHA-256")]
    (Hex/encodeHexString ^bytes (.digest md b))))

(defn- ->bytes ^bytes [^String s]
  (.getBytes s "UTF-8"))

(defn repo-configured?
  "True when a repository is connected via remote-sync. Read by keyword so this
   OSS namespace has no compile-time dependency on the enterprise remote-sync
   module; returns false when that module (and its setting) isn't loaded."
  []
  (not (str/blank? (try (setting/get :remote-sync-url) (catch Throwable _ nil)))))

;;; ----------------------------------------------------- Discovery -----------------------------------------------------

(def ^:private config-path-regex
  ;; data_apps/<dir>/data_app.{yml,yaml}, where <dir> is a single path segment
  (re-pattern (format "%s/[^/]+/%s"
                      (Pattern/quote data-app.config/apps-dir)
                      (.pattern ^Pattern data-app.config/config-file-re))))

(defn- discover-app-configs
  "Given the snapshot's `list-files` and `read-file` fns (where `read-file`
   returns file text or nil), return one entry per `data_apps/<dir>/data_app.yml`,
   each either a parsed app `{:slug :display_name :bundle :allowed_hosts}` (with
   `:bundle` the repo-root relative bundle path) or `{:config-error <message>}`. Parse/read
   failures are isolated per app so one bad config can't abort the whole sync."
  [list-files read-file]
  (for [config-path (filter #(re-matches config-path-regex %) (list-files))
        :let [dir (subs config-path 0 (str/last-index-of config-path "/"))]]
    (try
      (if-let [content (read-file config-path)]
        (let [{:keys [slug display_name path allowed_hosts]} (data-app.config/parse-app-config (->bytes content) dir)]
          {:slug slug, :display_name display_name, :bundle (str dir "/" path), :allowed_hosts allowed_hosts})
        {:config-error (tru "Could not read {0}." config-path)})
      (catch Throwable e
        {:config-error (ex-message e)}))))

;;; ----------------------------------------------------- Materialize -----------------------------------------------------

(defn- upsert-by-name!
  "Insert or update by slug. Never writes `:enabled`, so the admin toggle (and the
   DB default of true for new rows) is preserved across syncs."
  [slug row]
  (if (t2/exists? :model/DataApp :name slug)
    (t2/update! :model/DataApp :name slug row)
    (t2/insert! :model/DataApp (assoc row :name slug))))

(defn- sync-app!
  "Materialize one app. On bundle failure, the row's metadata is still upserted
   with `sync_error` set so the app appears in the list with its failure; the
   previously cached bundle (if any) is kept."
  [{:keys [slug display_name bundle sha read-file allowed_hosts]}]
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
      (upsert-by-name! slug {:display_name    display_name
                             :allowed_hosts   allowed_hosts
                             :bundle_path     bundle
                             :bundle          bytes
                             :bundle_hash     (bytes-hash bytes)
                             :last_synced_sha sha
                             :last_synced_at  :%now
                             :sync_error      nil}))
    (catch Throwable e
      (upsert-by-name! slug {:display_name  display_name
                             :allowed_hosts allowed_hosts
                             :bundle_path   bundle
                             :sync_error    (ex-message e)})
      (log/warnf e "[data-app] failed to sync app %s" slug))))

(defn import-from-snapshot!
  "Materialize data apps from a synced repo `snapshot`:

     {:read-file  (fn [path] -> <file-text-string> | nil)
      :list-files (fn [] -> [<path-string> ...])
      :sha        <commit-sha-string>}

   Discovers every `data_apps/<dir>/data_app.yml`, upserts a row per app, and
   prunes rows whose directory is gone — all in one transaction. Returns
   `{:synced <n>, :sha <sha>, :config-errors [<message> ...]}`. A malformed
   `data_app.yml` is isolated (collected into `:config-errors`, that app skipped)
   rather than aborting the others; per-app bundle failures are recorded on the
   row. Throws only on duplicate slugs, which make app identity ambiguous."
  [{:keys [read-file list-files sha]}]
  ;; realize discovery once (it calls read-file/parse per config); `results` is
  ;; then walked several times below
  (let [results (vec (discover-app-configs list-files read-file))
        good    (filter :slug results)
        errors  (vec (keep :config-error results))
        slugs   (map :slug good)]
    (when (not= (count slugs) (count (distinct slugs)))
      (throw (ex-info (tru "Two data apps in the repository share a slug.")
                      {:status-code 400})))
    (t2/with-transaction [_conn]
      (doseq [{:keys [slug display_name bundle allowed_hosts]} good]
        (sync-app! {:slug slug, :display_name display_name, :bundle bundle
                    :allowed_hosts allowed_hosts
                    :sha sha, :read-file read-file}))
      ;; Prune apps whose directory is gone — but only when every config parsed.
      ;; With an unparsed config we can't tell a removed app from one we failed to
      ;; read this sync, so we leave existing rows alone rather than risk deleting
      ;; a still-present app.
      (when (empty? errors)
        (let [orphans (set/difference (set (t2/select-fn-set :name :model/DataApp))
                                      (set slugs))]
          (when (seq orphans)
            (t2/delete! :model/DataApp :name [:in orphans])
            (log/infof "[data-app] pruned %d app(s) removed from the repo: %s"
                       (count orphans) (str/join ", " orphans))))))
    (log/infof "[data-app] synced sha=%s apps=%d errors=%d" sha (count good) (count errors))
    {:synced (count good), :sha sha, :config-errors errors}))

(defn sync-from-snapshot!
  "Entry point for the remote-sync import pipeline. Materializes data apps from
   the just-imported `snapshot` (see [[import-from-snapshot!]] for its shape).
   Never throws, so it can't break the surrounding remote-sync import: a thrown
   failure is logged and swallowed, and a malformed `data_app.yml` is logged and
   its app simply doesn't appear. Returns the [[import-from-snapshot!]] result, or
   nil if the sync threw."
  [snapshot]
  (try
    (let [{:keys [config-errors] :as result} (import-from-snapshot! snapshot)]
      (when (seq config-errors)
        (log/warnf "[data-app] %d data_app.yml config(s) skipped: %s"
                   (count config-errors) (str/join "; " config-errors)))
      result)
    (catch Throwable e
      (log/warn e "[data-app] sync from remote-sync snapshot failed")
      nil)))

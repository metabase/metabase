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

;;; ----------------------------------------------------- Validation -----------------------------------------------------

(defn- duplicate-slug-errors
  "One message per slug that more than one app directory declares, naming the
   directories that collide so the author knows which to rename."
  [cfgs]
  (for [[slug claimants] (sort-by key (group-by :slug cfgs))
        :when (< 1 (count claimants))]
    (tru "The slug \"{0}\" is declared by more than one data app ({1}). Give each app a unique slug."
         slug (str/join ", " (sort (map :bundle claimants))))))

(defn validate-snapshot!
  "Throw if the repo's data apps can't be materialized as a set. Called by the
   remote-sync import *before* it writes anything (see the remote-sync `impl`
   namespace), so an invalid repo fails the whole pull instead of being
   half-applied.

   Today the only such problem is a duplicate slug. The slug *is* an app's
   identity — rows are upserted by it and `/apps/<slug>` is served from it — so
   when two directories declare the same one there's no non-arbitrary way to say
   which directory the app is. Any winner we picked would be chosen by something
   the author never wrote (path order, or which app happened to sync first, which
   would make the same commit produce different state on different instances), and
   the loser's app would silently vanish. A repo like that doesn't describe a valid
   set of apps, so we refuse to import it and say why.

   Per-app problems are *not* validated here: a bundle that's missing or too big
   breaks only its own app and leaves the rest of the repo perfectly valid, so it
   stays isolated on that app's row as a `sync_error` (see [[sync-app!]]) rather
   than blocking everyone else's pull. Same for a `data_app.yml` too malformed to
   even name an app ([[import-from-snapshot!]]'s `:config-errors`)."
  [{:keys [read-file list-files]}]
  (let [cfgs (filter :slug (discover-app-configs list-files read-file))]
    (when-let [errors (seq (duplicate-slug-errors cfgs))]
      ;; `:data-app-errors` is what remote-sync matches on to surface these verbatim,
      ;; rather than pattern-matching the message text (see `source-error-message`).
      (throw (ex-info (str/join " " errors)
                      {:status-code 400, :data-app-errors (vec errors)})))))

;;; ----------------------------------------------------- Import -----------------------------------------------------

(defn import-from-snapshot!
  "Materialize data apps from a synced repo `snapshot`:

     {:read-file  (fn [path] -> <file-text-string> | nil)
      :list-files (fn [] -> [<path-string> ...])
      :sha        <commit-sha-string>}

   Discovers every `data_apps/<dir>/data_app.yml` and upserts a row per app in a
   single transaction. Apps not present in the snapshot are left untouched (a
   sync never deletes — removal is an explicit admin action). Returns
   `{:synced <n>, :changed <n>, :sha <sha>, :config-errors [<message> ...]}`,
   where `:changed` is how many apps this sync actually created/updated
   (a `last_synced_sha` bump on an unchanged app does not count). A malformed
   `data_app.yml` is isolated (collected into `:config-errors`, that app skipped)
   rather than aborting the others; per-app bundle failures are recorded on the
   row. Throws on a repo that isn't valid at all — see [[validate-snapshot!]],
   which the import pipeline runs up front so this can't happen mid-write."
  [{:keys [read-file list-files sha] :as snapshot}]
  ;; realize discovery once (it calls read-file/parse per config); `results` is
  ;; then walked several times below
  (let [results  (vec (discover-app-configs list-files read-file))
        good     (filter :slug results)
        errors   (vec (keep :config-error results))
        ;; pre-sync rows, so we can tell a real change from a sha/timestamp bump
        existing (into {} (map (juxt :name identity))
                       (t2/select [:model/DataApp :name :display_name :allowed_hosts
                                   :bundle_path :bundle_hash :sync_error]))]
    ;; belt-and-braces: the pull already rejected an invalid repo before committing
    ;; anything, but a direct caller hasn't, and materializing one is destructive
    ;; (one app would overwrite another's row).
    (validate-snapshot! snapshot)
    (let [changed
          ;; Upsert-only: a sync never deletes. Apps materialized from a previous
          ;; repo are kept (they survive unlinking, and switching repos), and an
          ;; app sharing a slug is overridden in place by `upsert-by-name!`. Rows
          ;; are removed only by an explicit admin action (see the API's DELETE).
          (t2/with-transaction [_conn]
            (reduce (fn [n cfg]
                      (cond-> n
                        (sync-app! (get existing (:slug cfg))
                                   (assoc cfg :sha sha :read-file read-file))
                        inc))
                    0 good))]
      (log/infof "[data-app] synced sha=%s apps=%d changed=%d errors=%d"
                 sha (count good) changed (count errors))
      {:synced (count good), :changed changed, :sha sha, :config-errors errors})))

(defn sync-from-snapshot!
  "Entry point for the remote-sync import pipeline. Materializes data apps from
   the just-imported `snapshot` (see [[import-from-snapshot!]] for its shape).

   Never throws, and by this point that no longer hides anything: a repo the apps
   can't be materialized from was already rejected by [[validate-snapshot!]] before
   the pull committed, and the problems that remain are per-app by construction —
   a bundle that won't load is recorded on its own row, a `data_app.yml` that can't
   name an app is logged. What the `catch` covers is the genuinely unexpected, and
   there it's the only sane behavior: the serdes half of this pull is already
   committed and can't be rolled back, so throwing here would fail a task whose
   content import actually succeeded. Returns the [[import-from-snapshot!]] result,
   or nil if the sync threw."
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

(ns metabase.system.paths
  "Checks for local file paths against the [[metabase.system.settings/readable-paths]] and
  [[metabase.system.settings/writable-paths]] allowlists."
  (:require
   [metabase.system.settings :as system.settings]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]])
  (:import
   (java.nio.file FileSystem FileSystems Path)))

(set! *warn-on-reflection* true)

(defn- ->normalized-path ^Path [^FileSystem fs ^String path]
  ;; absolute first: normalizing a relative path cannot collapse a leading `..`
  (-> (.getPath fs path (u/varargs String)) .toAbsolutePath .normalize))

(defn- allowed-path?
  "Whether `path` is one of the `allowlist` directories or under one. Compares normalized paths, so `..` cannot
  escape an allowed directory, and whole path segments, so `/abc` does not allow `/abcd`. A `/` entry allows any
  path; on Windows it would otherwise mean only the root of the current drive."
  ([allowlist path]
   (allowed-path? (FileSystems/getDefault) allowlist path))
  ([^FileSystem fs allowlist path]
   (or (boolean (some #{"/"} allowlist))
       (let [path (->normalized-path fs path)]
         (boolean (some #(.startsWith path (->normalized-path fs %)) allowlist))))))

(defn readable-path?
  "Whether Metabase may read the local file at `path`."
  [path]
  (allowed-path? (system.settings/readable-paths) path))

(defn writable-path?
  "Whether Metabase may write the local file at `path`."
  [path]
  (allowed-path? (system.settings/writable-paths) path))

(defn ensure-readable-path!
  "Returns `path` if Metabase may read it, otherwise throws a 400."
  [path]
  (when-not (readable-path? path)
    (throw (ex-info (tru "Reading from path is disallowed: {0}" path)
                    {:file-path path, :access :read, :status-code 400})))
  path)

(defn ensure-writable-path!
  "Returns `path` if Metabase may write it, otherwise throws a 400."
  [path]
  (when-not (writable-path? path)
    (throw (ex-info (tru "Writing to path is disallowed: {0}" path)
                    {:file-path path, :access :write, :status-code 400})))
  path)

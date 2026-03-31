(ns metabase-enterprise.custom-viz-plugin.manifest
  "Parsing and validation for custom visualization plugin manifest files (metabase-plugin.json)."
  (:require
   [clojure.string :as str]
   [metabase.config.core :as config]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log])
  (:import
   (java.nio.file FileSystems)
   (org.semver4j Semver SemverException)))

(set! *warn-on-reflection* true)

(def ^:private ^:const manifest-filename "metabase-plugin.json")

(defn manifest-path
  "Returns the manifest filename. Exposed for use in cache/git layers."
  []
  manifest-filename)

(defn parse-manifest
  "Parse a manifest JSON string. Returns the parsed map or nil if parsing fails."
  [^String json-str]
  (try
    (json/decode+kw json-str)
    (catch Exception e
      (log/warnf "Failed to parse %s: %s" manifest-filename (ex-message e))
      nil)))

;;; ------------------------------------------------ Version ------------------------------------------------

(defn compatible?
  "Check whether a plugin with the given metabase_version range string is compatible with the
   current Metabase version. Uses npm/node-semver range syntax (e.g. \">=59\", \"^59\", \">=59 <61\").
   Returns true if no range is specified, or if the current version satisfies the range.
   In dev mode (no version info), always returns true."
  [{:keys [metabase_version]}]
  (let [major (config/current-major-version)
        minor (config/current-minor-version)]
    (if (or config/is-dev? (nil? major) (str/blank? metabase_version))
      true
      (try
        (let [current (Semver/coerce (str major "." (or minor 0) ".0"))]
          (.satisfies current ^String metabase_version))
        (catch SemverException e
          (log/warnf "Invalid version range in manifest: %s — %s" metabase_version (ex-message e))
          false)))))

;;; ------------------------------------------------ Assets ------------------------------------------------

(def ^:private image-extensions
  "File extensions considered to be images for static asset serving."
  #{".svg" ".png" ".jpg" ".jpeg" ".gif" ".webp" ".ico" ".avif"})

(defn- image-file?
  "Returns true if the file path has a recognized image extension."
  [^String path]
  (let [lower (u/lower-case-en path)]
    (some #(str/ends-with? lower %) image-extensions)))

(def ^:private allowed-asset-extensions
  "File extensions allowed for static asset serving (images + locale JSON)."
  (into image-extensions #{".json"}))

(defn- allowed-asset-file?
  "Returns true if the file path has a recognized allowed extension."
  [^String path]
  (let [lower (u/lower-case-en path)]
    (some #(str/ends-with? lower %) allowed-asset-extensions)))

(defn- glob?
  "Returns true if the path contains glob characters (*, ?, or {})."
  [^String path]
  (boolean (re-find #"[*?\[\{]" path)))

(defn- path-matcher
  "Create a java.nio.file PathMatcher for a glob pattern."
  [^String pattern]
  (.getPathMatcher (FileSystems/getDefault) (str "glob:" pattern)))

(defn expand-globs
  "Expand glob patterns in asset paths against a list of available file paths.
   Non-glob paths are returned as-is (if they have an allowed extension).
   Glob paths are matched against `available-paths` and only matches with
   allowed extensions are returned."
  [asset-entries available-paths]
  (let [{globs true literals false} (group-by glob? asset-entries)]
    (distinct
     (concat
      (filter allowed-asset-file? literals)
      (when (seq globs)
        (let [matchers (map path-matcher globs)]
          (filter (fn [^String path]
                    (and (allowed-asset-file? path)
                         (let [p (java.nio.file.Path/of path (into-array String []))]
                           (some #(.matches ^java.nio.file.PathMatcher % p) matchers))))
                  available-paths)))))))

(defn asset-paths
  "List the static asset names whitelisted by the manifest.
   Includes names from the `assets` array and the `icon` (if it's an image filename).
   Supports glob patterns (e.g. `locales/*`) which are expanded by the caller.
   Returns literal paths and glob patterns; use [[expand-globs]] to resolve globs
   against available files."
  [manifest]
  (let [declared  (get manifest :assets [])
        icon-name (when-let [icon (:icon manifest)]
                    (when (image-file? icon) icon))]
    (distinct (concat declared (when icon-name [icon-name])))))

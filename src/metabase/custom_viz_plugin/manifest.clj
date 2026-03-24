(ns metabase.custom-viz-plugin.manifest
  "Parsing and validation for custom visualization plugin manifest files (metabase-plugin.json)."
  (:require
   [cheshire.core :as json]
   [clojure.string :as str]
   [metabase.config.core :as config]
   [metabase.util.log :as log])
  (:import
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
    (json/parse-string json-str true)
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
          (.satisfies current metabase_version))
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
  (let [lower (str/lower-case path)]
    (some #(str/ends-with? lower %) image-extensions)))

(defn asset-paths
  "List the static image asset names whitelisted by the manifest.
   Includes names from the `assets` array and the `icon` (if it's an image filename).
   Only image files are included. Returns simple filenames like `icon.svg`.
   These map to `dist/assets/<name>` in the repo."
  [manifest]
  (let [declared  (filter image-file? (get manifest :assets []))
        icon-name (when-let [icon (:icon manifest)]
                    (when (image-file? icon) icon))]
    (distinct (concat declared (when icon-name [icon-name])))))

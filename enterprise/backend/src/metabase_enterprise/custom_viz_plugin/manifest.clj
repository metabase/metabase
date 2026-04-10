(ns metabase-enterprise.custom-viz-plugin.manifest
  "Parsing and validation for custom visualization plugin manifest files (metabase-plugin.json)."
  (:require
   [clojure.string :as str]
   [metabase.config.core :as config]
   [metabase.util :as u]
   [metabase.util.json :as json]
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
    (json/decode+kw json-str)
    (catch Exception e
      (log/warnf "Failed to parse %s: %s" manifest-filename (ex-message e))
      nil)))

;;; ------------------------------------------------ Version ------------------------------------------------

(defn compatible?
  "Check whether a plugin with the given metabase_version range string is compatible with the
   current Metabase version. Uses npm/node-semver range syntax (e.g. \">=1.59\", \"^1.59\", \">=1.59 <1.61\").
   Returns true if no range is specified, or if the current version satisfies the range.
   In dev mode (no version info), always returns true."
  [{:keys [metabase_version]}]
  (let [current-version (:tag config/mb-version-info)]
    (if (or config/is-dev? (nil? current-version) (str/blank? metabase_version))
      true
      (try
        (let [current (Semver/coerce current-version)]
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
  "File extensions allowed for static asset serving (images + JSON)."
  (into image-extensions #{".json"}))

(defn- allowed-asset-file?
  "Returns true if the file path has a recognized allowed extension."
  [^String path]
  (let [lower (u/lower-case-en path)]
    (some #(str/ends-with? lower %) allowed-asset-extensions)))

(defn- icon-bundle-file?
  "Returns true if `path` looks like a themeable icon bundle: a `.js` file.
   This is the only place we allow `.js` files through the asset whitelist."
  [^String path]
  (str/ends-with? (u/lower-case-en path) ".js"))

(defn safe-relative-path?
  "Returns true if path normalizes to a relative path with no directory traversal."
  [^String path]
  (let [normalized (.normalize (java.nio.file.Path/of path (into-array String [])))]
    (and (not (.isAbsolute normalized))
         (not (.startsWith normalized "..")))))

(defn icon-bundle-path
  "Returns the themeable icon bundle path declared in the manifest, if any.
   Only `.js` files with safe relative paths are accepted."
  [manifest]
  (when-let [bundle (:iconBundle manifest)]
    (when (and (icon-bundle-file? bundle) (safe-relative-path? bundle))
      bundle)))

(defn asset-paths
  "List the static asset paths whitelisted by the manifest.
   Includes paths from the `assets` array (filtered to allowed extensions and
   safe relative paths), the `icon` / `iconDark` images, and the optional
   `iconBundle` JS file used for themeable picker icons.
   Only explicitly listed paths are supported — no glob patterns."
  [manifest]
  (let [declared       (filter (every-pred allowed-asset-file? safe-relative-path?) (get manifest :assets []))
        icon-name      (when-let [icon (:icon manifest)]
                         (when (and (image-file? icon) (safe-relative-path? icon)) icon))
        icon-dark-name (when-let [icon-dark (:iconDark manifest)]
                         (when (and (image-file? icon-dark) (safe-relative-path? icon-dark)) icon-dark))
        icon-bundle    (icon-bundle-path manifest)]
    (distinct (concat declared
                      (when icon-name [icon-name])
                      (when icon-dark-name [icon-dark-name])
                      (when icon-bundle [icon-bundle])))))

(defn asset-content-type
  "Return the MIME content type for an allowed asset file, or nil if not recognized.
   Allows image files, JSON files (for locale translations), and `.js` files
   (used for themeable icon bundles)."
  [^String path]
  (cond
    (str/ends-with? path ".json")
    "application/json"

    (icon-bundle-file? path)
    "application/javascript"

    :else
    (let [ct (java.net.URLConnection/guessContentTypeFromName path)]
      (when (and ct (str/starts-with? ct "image/"))
        ct))))

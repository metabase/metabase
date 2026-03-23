(ns metabase.custom-viz-plugin.manifest
  "Parsing and validation for custom visualization plugin manifest files (metabase-plugin.json)."
  (:require
   [cheshire.core :as json]
   [clojure.string :as str]
   [metabase.config.core :as config]
   [metabase.util.log :as log]))

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

(defn- extract-version
  "Extract a version number from the manifest's :metabase map. Returns nil if not present or not an integer."
  [manifest key]
  (let [v (get-in manifest [:metabase key])]
    (when (integer? v) v)))

(defn extract-version-bounds
  "Extract min and max Metabase version bounds from a parsed manifest.
   Returns {:min_metabase_version int-or-nil, :max_metabase_version int-or-nil}."
  [manifest]
  {:min_metabase_version (extract-version manifest :min_version)
   :max_metabase_version (extract-version manifest :max_version)})

(defn compatible?
  "Check whether a plugin with the given version bounds is compatible with the current Metabase version.
   Returns true if no bounds are specified, or if the current version falls within bounds.
   In dev mode (no version info), always returns true."
  [{:keys [min_metabase_version max_metabase_version]}]
  (let [current-major (config/current-major-version)]
    (if (or config/is-dev? (nil? current-major))
      ;; In dev mode always compatible
      true
      (and (or (nil? min_metabase_version) (<= min_metabase_version current-major))
           (or (nil? max_metabase_version) (<= current-major max_metabase_version))))))

(defn asset-paths
  "List the static asset paths declared in the manifest, or inferred from the dist/assets/ convention.
   Returns a sequence of paths relative to the repo root (e.g. [\"dist/assets/icon.svg\"])."
  [manifest all-repo-files]
  (let [;; assets explicitly listed in manifest
        declared  (get manifest :assets [])
        ;; also include the icon if it's a path (not an icon name)
        icon-path (when-let [icon (:icon manifest)]
                    (when (re-find #"/" icon)
                      icon))
        ;; all files under dist/assets/ in the repo
        auto      (filter #(str/starts-with? % "dist/assets/") all-repo-files)]
    (distinct (concat declared (when icon-path [icon-path]) auto))))

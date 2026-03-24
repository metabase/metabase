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

;;; ------------------------------------------------ Version ------------------------------------------------

(defn- parse-semver
  "Parse a major version integer from a semver-ish string like \"59\", \"v59\", \"0.59\", \"v0.59.3\".
   Returns the major version integer or nil."
  [^String s]
  (when s
    (some-> (re-find #"(\d+)(?:\.\d+)*" (str/replace s #"^v" ""))
            second
            parse-long)))

(defn- parse-version-range
  "Parse a version range string using npm/package.json-style syntax.
   Supports: \">=59\", \"<=60\", \">59 <61\", \">=59 <=61\", \"59\" (exact).
   Returns {:min int-or-nil, :max int-or-nil}."
  [^String range-str]
  (when (and range-str (not (str/blank? range-str)))
    (let [parts  (str/split (str/trim range-str) #"\s+")
          result (reduce
                  (fn [acc part]
                    (cond
                      (str/starts-with? part ">=")
                      (assoc acc :min (parse-semver (subs part 2)))

                      (str/starts-with? part ">")
                      (assoc acc :min (some-> (parse-semver (subs part 1)) inc))

                      (str/starts-with? part "<=")
                      (assoc acc :max (parse-semver (subs part 2)))

                      (str/starts-with? part "<")
                      (assoc acc :max (some-> (parse-semver (subs part 1)) dec))

                      :else
                      (let [v (parse-semver part)]
                        (assoc acc :min v :max v))))
                  {}
                  parts)]
      result)))

(defn compatible?
  "Check whether a plugin with the given metabase_version range string is compatible with the
   current Metabase version. Returns true if no range is specified, or if the current version
   falls within the range. In dev mode (no version info), always returns true."
  [{:keys [metabase_version]}]
  (let [current-major (config/current-major-version)]
    (if (or config/is-dev? (nil? current-major))
      true
      (if-let [{:keys [min max]} (parse-version-range metabase_version)]
        (and (or (nil? min) (<= min current-major))
             (or (nil? max) (<= current-major max)))
        true))))

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
  "List the static image asset paths whitelisted by the manifest.
   Includes paths from the `assets` array and the `icon` path (if it's a file path).
   Only image files are included. Returns a sequence of paths relative to the repo root."
  [manifest]
  (let [;; assets explicitly listed in manifest (filtered to images only)
        declared  (filter image-file? (get manifest :assets []))
        ;; include the icon if it's a path (contains a slash) and is an image
        icon-path (when-let [icon (:icon manifest)]
                    (when (and (re-find #"/" icon) (image-file? icon))
                      icon))]
    (distinct (concat declared (when icon-path [icon-path])))))

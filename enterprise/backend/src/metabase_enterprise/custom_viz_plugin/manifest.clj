(ns metabase-enterprise.custom-viz-plugin.manifest
  "Parsing and validation for custom visualization plugin manifest files (metabase-plugin.json)."
  (:require
   [clojure.string :as str]
   [malli.error :as me]
   [metabase.config.core :as config]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr])
  (:import
   (org.semver4j Semver)))

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

(def ^:private ManifestFieldTypes
  "Type requirements for the manifest fields Metabase reads. The map is open —
   extra keys pass through — and every field is optional here; `name` presence
   is enforced separately with a friendlier message."
  [:map
   [:name     {:optional true} [:maybe :string]]
   [:icon     {:optional true} [:maybe :string]]
   [:metabase {:optional true} [:maybe [:map [:version {:optional true} [:maybe :string]]]]]
   [:sdk      {:optional true} [:maybe [:map [:version {:optional true} [:maybe :string]]]]]])

(defn validation-error
  "Humanized description of `manifest`'s type violations (e.g. a numeric
   `sdk.version`), or nil when the manifest is well-formed."
  [manifest]
  (some-> (mr/explain ManifestFieldTypes manifest) me/humanize))

;;; ------------------------------------------------ Version ------------------------------------------------

(defn compatible?
  "Check whether a plugin with the given metabase_version range string is compatible with the
   current Metabase version. Uses npm/node-semver range syntax against the full edition-prefixed
   version (e.g. \">=1.60.0\", \"^1.60\", \">=1.59 <1.61\"). Returns true if no range is specified,
   or if the current version satisfies the range. In dev mode (no version info), always returns true."
  [{:keys [metabase_version]}]
  (let [current-version (:tag config/mb-version-info)]
    (if (or config/is-dev? (nil? current-version) (str/blank? metabase_version))
      true
      (try
        (if-let [current (Semver/coerce current-version)]
          (.satisfies (.withClearedPreReleaseAndBuild current) ^String metabase_version)
          ;; Unknown/uncoercible current version (e.g. `vLOCAL_DEV` in CI) — be permissive.
          true)
        (catch Exception e
          (log/warnf "Invalid version range in manifest: %s — %s" metabase_version (ex-message e))
          false)))))

(def tested-sdk-version-range
  "npm-semver range of @metabase/custom-viz versions this Metabase release was
   tested against. Any npm range syntax works (e.g. `2.0`, `2.0 - 2.1`,
   `>=2.0.0 <3.0.0`) — keep it to versions that were actually tested, and keep
   it readable: it's shown verbatim in admin UI warnings."
  "2.0")

(defn sdk-version-tested?
  "Whether `sdk-version` satisfies [[tested-sdk-version-range]]. A nil/blank
   version means the bundle predates stamping and was built with SDK 1.x.
   Malformed or non-string versions count as untested. Pre-release and build
   metadata is stripped before matching so canary versions match like their
   releases."
  [sdk-version]
  (if-let [v (when (or (nil? sdk-version) (string? sdk-version))
               (Semver/coerce (if (str/blank? sdk-version) "1.0.0" sdk-version)))]
    (.satisfies (.withClearedPreReleaseAndBuild v) ^String tested-sdk-version-range)
    false))

(defn warnings
  "Soft version warnings for a plugin. Computed at read time and never stored,
   since they depend on the running Metabase version. Each warning carries a
   machine-readable `:type` plus params the frontend builds messages from.
   A wrong-typed `sdk.version` is treated as unstamped — uploads are validated,
   but serdes-imported manifests are not."
  [{:keys [metabase_version manifest] :as plugin}]
  (let [sdk-version (let [v (get-in manifest [:sdk :version])]
                      (when (string? v) v))]
    (cond-> []
      (not (sdk-version-tested? sdk-version))
      (conj {:type             "sdk-version-mismatch"
             :sdk_version      sdk-version
             :tested_sdk_range tested-sdk-version-range})

      (not (compatible? plugin))
      (conj {:type             "metabase-version-mismatch"
             :metabase_version metabase_version
             :current_version  (:tag config/mb-version-info)}))))

;;; ------------------------------------------------ Assets ------------------------------------------------

(def ^:private image-extensions
  "File extensions considered to be images for static asset serving."
  #{".svg" ".png" ".jpg" ".jpeg" ".gif" ".webp" ".ico" ".avif"})

(defn- image-file?
  "Returns true if the file path has a recognized image extension."
  [^String path]
  (let [lower (u/lower-case-en path)]
    (some #(str/ends-with? lower %) image-extensions)))

(defn safe-relative-path?
  "Returns true if path normalizes to a relative path with no directory traversal."
  [^String path]
  (let [normalized (.normalize (java.nio.file.Path/of path (into-array String [])))]
    (and (not (.isAbsolute normalized))
         (not (.startsWith normalized "..")))))

(defn asset-paths
  "List the static asset paths the backend will serve for a plugin.
   Custom viz plugins do not ship arbitrary assets — the only servable asset is the
   plugin `icon` (when it's an image with a safe relative path). Authors who need
   images inline them (e.g. base64) into their single JS bundle."
  [manifest]
  (when-let [icon (:icon manifest)]
    (when (and (image-file? icon) (safe-relative-path? icon))
      [icon])))

(defn asset-content-type
  "Return the MIME content type for an image asset file, or nil if not recognized.
   Only the plugin icon is served, so only image types are allowed."
  [^String path]
  (let [ct (java.net.URLConnection/guessContentTypeFromName path)]
    (when (and ct (str/starts-with? ct "image/"))
      ct)))

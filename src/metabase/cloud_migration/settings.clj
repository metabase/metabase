(ns metabase.cloud-migration.settings
  (:require
   [clojure.string :as str]
   [metabase.config :as config]
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting store-use-staging
  (deferred-tru "If staging store should be used instead of prod. True on dev.")
  :type       :boolean
  :visibility :internal
  :default    config/is-dev?
  :doc        false
  :export?    false)

(defn- default-to-staging?
  "It's against the rules to use setting values on namespace load, since they need the app DB to be loaded, and it isn't
  yet. So this is here so we can define default values for the settings below based on the env var value
  of [[store-use-staging]]."
  []
  (if-some [env-var-value (config/config-bool :mb-store-use-staging)]
    env-var-value
    config/is-dev?))

;;; TODO -- DEFAULT VALUES SHOULD NOT THE VALUE OF ANOTHER SETTING! BECAUSE GETTING SETTING VALUES REQUIRES THE APP DB
;;; TO BE SET UP!! AND IT IS NOT SET UP IMMEDIATELY ON LAUNCH!!

(defsetting store-url
  (deferred-tru "Store URL.")
  :encryption :no
  ;; should be :internal, but FE doesn't get internal settings. -- Someone else
  ;;
  ;; OK, then no it shouldn't be internal at all, internal is literally for Settings that are only visible to backend
  ;; code. -- Cam
  :visibility :admin
  :default    (str "https://store" (when (default-to-staging?) ".staging") ".metabase.com")
  :doc        false
  :export?    false)

(defsetting store-api-url
  (deferred-tru "Store API URL.")
  :encryption :no
  :visibility :internal
  :default    (str "https://store-api" (when (default-to-staging?) ".staging") ".metabase.com")
  :doc        false
  :export?    false)

(defsetting migration-dump-file
  (deferred-tru "Dump file for migrations.")
  :encryption :no
  :visibility :internal
  :default    nil
  :doc        false
  :export?    false)

(defn- is-invalid-mb-version?
  "These variations are not valid Metabase versions that can be found in production. They are mostly used for local
   development, or as fallback values if a :tag is missing altogether."
  [version]
  (or (= version "vLOCAL_DEV") (= version "vUNKNOWN") (str/ends-with? version "-SNAPSHOT")))

(defsetting migration-dump-version
  (deferred-tru "Custom dump version for migrations.")
  :encryption :no
  :visibility :internal
  ;; Use a known version on staging when there's no real version.
  ;; This will cause the restore to fail on cloud unless you also set `migration-dump-file` to
  ;; a dump from that version, but it lets you test everything else up to that point works.
  :default    (when (is-invalid-mb-version? (config/mb-version-info :tag))
                "v0.53.3")
  :doc        false
  :export?    false)

(defsetting read-only-mode
  (deferred-tru
   (str "Boolean indicating whether a Metabase instance is in read-only mode with regards to its app db. "
        "Will take up to 1m to propagate to other Metabase instances in a cluster."
        "Audit tables are excluded from read-only-mode mode."))
  :type       :boolean
  :visibility :admin
  :default    false
  :doc        false
  :export?    false)

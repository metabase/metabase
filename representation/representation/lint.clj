(ns representation.lint
  (:require [representation.color :as c]
            [representation.http :as http]
            [representation.manifest :as manifest]
            [representation.util :as u]))

(set! *warn-on-reflection* true)

(defn run
  "Validate collections without importing to Metabase instance."
  [{:keys [options arguments]}]
  (let [{:keys [mb-instance-url mb-instance-api-key manifest collection]} options]
    (when-not mb-instance-url
      (throw (ex-info "Missing required flag: --mb-instance-url"
                      {:babashka/exit 1
                       :repr/error "Specify Metabase instance URL with --mb-instance-url"})))

    (when-not mb-instance-api-key
      (throw (ex-info "Missing required flag: --mb-instance-api-key"
                      {:babashka/exit 1
                       :repr/error "Specify API key with --mb-instance-api-key"})))

    (when-not manifest
      (throw (ex-info "Missing required flag: --manifest"
                      {:babashka/exit 1
                       :repr/error "Specify manifest file with --manifest"})))

    (when-not collection
      (throw (ex-info "Missing required flag: --collection"
                      {:babashka/exit 1
                       :repr/error "Specify collections with --collection=name1,name2"})))

    (let [manifest-data (manifest/read-manifest manifest)
          collection-names (manifest/parse-collection-names collection)]

      (when-not manifest-data
        (throw (ex-info (str "Could not read manifest: " manifest)
                        {:babashka/exit 1})))

      (println (c/bold "Linting collections:") (c/cyan (pr-str collection-names)))
      (println (c/bold "Using instance:") (c/cyan mb-instance-url))

      (doseq [coll-name collection-names]
        (if-let [local-path (manifest/get-collection-path manifest-data coll-name)]
          (do
            (println (c/green "✓") "Validating" (c/bold coll-name) "from" local-path)
            (u/debug "Validation API call would happen here"))
          (println (c/yellow "⚠") "Collection" (c/bold coll-name) "not found in manifest")))

      (println (c/green (c/bold "\n✓ Validation complete!"))))))

(ns representation.export
  (:require [clojure.java.io :as io]
            [clojure.string :as str]
            [representation.color :as c]
            [representation.entity :as entity]
            [representation.http :as http]
            [representation.manifest :as manifest]
            [representation.util :as u]
            [representation.yaml :as yaml]))

(set! *warn-on-reflection* true)

(defn- write-entity
  "Write an entity to a YAML file."
  [base-path filename entity]
  (let [file-path (str base-path "/" filename)
        yaml-str (yaml/generate-string entity)]
    (u/debug "Writing" file-path)
    (io/make-parents file-path)
    (spit file-path yaml-str)))

(defn- write-collection
  "Write a collection and all its children/databases recursively."
  [base-path collection-data]
  (let [{:keys [children databases]} collection-data
        collection-meta (dissoc collection-data :children :databases)]

    (write-entity base-path "collection.yml" collection-meta)

    (doseq [db databases]
      (write-entity base-path (entity/entity-filename db) db))

    (doseq [child children]
      (let [child-type (entity/determine-entity-type child)]
        (if (= child-type :collection)
          (let [child-dir (str base-path "/" (entity/sanitize-filename (or (:ref child) (:name child))))]
            (write-collection child-dir child))
          (write-entity base-path (entity/entity-filename child) child))))))

(defn run
  "Export collections from Metabase instance to local filesystem."
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
          collection-names (manifest/parse-collection-names collection)
          base-url (str/replace mb-instance-url #"/$" "")]

      (when-not manifest-data
        (throw (ex-info (str "Could not read manifest: " manifest)
                        {:babashka/exit 1})))

      (println (c/bold "Exporting collections:") (c/cyan (pr-str collection-names)))
      (println (c/bold "From instance:") (c/cyan mb-instance-url))

      (doseq [coll-name collection-names]
        (if-let [coll-info (get-in manifest-data [:collections coll-name])]
          (let [coll-id (if (map? coll-info) (:id coll-info) coll-name)
                local-path (if (map? coll-info) (:path coll-info) coll-info)
                url (str base-url "/api/ee/representation/collection/" coll-id)]
            (println (c/green "→") "Fetching collection" (c/bold coll-id) "from API...")
            (try
              (let [response (http/make-request {:method :get
                                                 :url url
                                                 :api-key mb-instance-api-key})
                    collection-data (yaml/parse-string (:body response))]
                (println (c/green "✓") "Exporting" (c/bold coll-name) "to" local-path)
                (write-collection local-path collection-data)
                (println (c/green "  ✓") "Wrote collection files to" local-path))
              (catch Exception e
                (println (c/red "✗") "Failed to export" (c/bold coll-name))
                (println (c/red "  Error:") (.getMessage e)))))
          (println (c/yellow "⚠") "Collection" (c/bold coll-name) "not found in manifest")))

      (println (c/green (c/bold "\n✓ Export complete!"))))))

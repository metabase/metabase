(ns representation.import
  (:require [clojure.java.io :as io]
            [clojure.string :as str]
            [representation.color :as c]
            [representation.entity :as entity]
            [representation.http :as http]
            [representation.manifest :as manifest]
            [representation.util :as u]
            [representation.yaml :as yaml]))

(defn- read-entity
  "Read and parse a YAML entity file."
  [filepath]
  (try
    (yaml/parse-string (slurp filepath))
    (catch Exception e
      (u/debug "Failed to read entity file:" filepath (.getMessage e))
      nil)))

(defn- find-entity-files
  "Find all entity files in a directory. Returns map of {:databases [...] :children [...] :subdirs [...]}."
  [dir-path]
  (let [dir (io/file dir-path)
        files (when (.exists dir) (.listFiles dir))
        result {:databases [] :children [] :subdirs []}]
    (if-not files
      result
      (reduce
       (fn [acc file]
         (let [filename (.getName file)]
           (cond
             (.isDirectory file)
             (update acc :subdirs conj file)

             (= filename "collection.yml")
             acc

             :else
             (when-let [parsed (entity/parse-entity-filename filename)]
               (case (:type parsed)
                 :database (update acc :databases conj file)
                 :card (update acc :children conj file)
                 acc)))))
       result
       files))))

(defn- reconstruct-collection
  "Recursively reconstruct a collection bundle from directory structure."
  [dir-path]
  (let [collection-file (io/file dir-path "collection.yml")
        collection-meta (when (.exists collection-file)
                          (read-entity (.getPath collection-file)))
        {:keys [databases children subdirs]} (find-entity-files dir-path)
        database-entities (keep #(read-entity (.getPath %)) databases)
        child-entities (keep #(read-entity (.getPath %)) children)
        subdir-collections (keep #(reconstruct-collection (.getPath %)) subdirs)
        all-children (concat child-entities subdir-collections)]
    (when collection-meta
      (assoc collection-meta
             :databases database-entities
             :children (vec all-children)))))

(set! *warn-on-reflection* true)

(defn run
  "Import collections from local filesystem to Metabase instance."
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
          base-url (str/replace mb-instance-url #"/$" "")
          errors (atom [])]

      (when-not manifest-data
        (throw (ex-info (str "Could not read manifest: " manifest)
                        {:babashka/exit 1})))

      (println (c/bold "Importing collections:") (c/cyan (pr-str collection-names)))
      (println (c/bold "To instance:") (c/cyan mb-instance-url))

      (doseq [coll-name collection-names]
        (if-let [coll-info (get-in manifest-data [:collections coll-name])]
          (let [local-path (if (map? coll-info) (:path coll-info) coll-info)
                url (str base-url "/api/ee/representation/collection/import")]
            (println (c/green "→") "Reading collection from" local-path "...")
            (try
              (if-let [bundle (reconstruct-collection local-path)]
                (let [yaml-body (yaml/generate-string bundle)
                      collection-name (:name bundle)]
                  (println (c/green "✓") "Importing collection" (c/bold collection-name))
                  (let [response (http/make-request {:method :post
                                                     :url url
                                                     :api-key mb-instance-api-key
                                                     :body yaml-body})]
                    (println (c/green "  ✓") "Successfully imported collection")))
                (do
                  (println (c/red "✗") "Could not read collection from" local-path)
                  (swap! errors conj coll-name)))
              (catch Exception e
                (println (c/red "✗") "Failed to import" (c/bold coll-name))
                (println (c/red "  Error:") (.getMessage e))
                (swap! errors conj coll-name))))
          (do
            (println (c/yellow "⚠") "Collection" (c/bold coll-name) "not found in manifest")
            (swap! errors conj coll-name))))

      (if (empty? @errors)
        (println (c/green (c/bold "\n✓ Import complete!")))
        (println (c/red (c/bold "\n✗ Import failed for:")) (c/red (str/join ", " @errors)))))))

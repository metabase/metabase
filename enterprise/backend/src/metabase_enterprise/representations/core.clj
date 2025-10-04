(ns metabase-enterprise.representations.core
  "Core functionality for the representations module that enables human-writable
   formats for Metabase entities for version control and programmatic management."
  (:require
   [clj-yaml.core :as clj-yaml]
   [clojure.java.io :as io]
   [clojure.walk :as walk]
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.import :as import]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   [java.io File]))

(set! *warn-on-reflection* true)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Validate representation structure

(defn normalize-representation
  "Validates a representation against its schema based on the type field.

   The type field can be either:
   - Simple: 'question', 'collection' (defaults to v0)
   - Versioned: 'v0/question', 'v1/collection' (explicit version)

   The schemas themselves expect simple types, so we strip the version
   before validation if present.

   Handles both string and keyword keys from YAML parsing.
   Applies JSON decoders to convert strings to appropriate types (e.g., \"scheduled\" -> :scheduled).

   Throws an exception if validation fails.
   Returns the decoded and validated representation if validation passes."
  [representation]
  (import/normalize-representation representation))

;;;;;;;;;;;
;; Import

(defn yaml->toucan
  "Convert a validated representation into data suitable for creating/updating an entity.
   Returns a map with keys matching the Toucan model fields.
   Does NOT insert into the database - just transforms the data.
   Delegates to the multimethod yaml->toucan for extensibility."
  ([valid-representation]
   (import/yaml->toucan valid-representation nil))
  ([valid-representation ref-index]
   (import/yaml->toucan valid-representation ref-index)))

(defn persist!
  "Persist the representation with t2"
  ([representation]
   (persist! representation nil))
  ([representation ref-index]
   (when-let [validated (normalize-representation representation)]
     (import/persist! validated ref-index))))

(comment
  (yaml->toucan
   (import-yaml "test_resources/representations/v0/product-performance.model.yml")))

;; =============================================================== ;;

(defn export-with-refs
  "Export a Metabase entity to its human-readable representation.
   Delegates to the multimethod export-entity for extensibility."
  [t2-model]
  (export/export-entity t2-model))

(defn export-with-ids
  "Export a Metabase entity to its human-readable representation with direct IDs.
   Uses actual database IDs, table IDs (via 'card__123' strings), and integer IDs.
   Suitable for single-file exports that will be loaded via curl with direct ID resolution.
   Delegates to the multimethod export-entity for extensibility."
  [t2-model]
  (binding [export/*use-refs* false]
    (export/export-entity t2-model)))

;;;;;;;;;;;;;;;;;;;;;;;;
;; Static Experiments ;;

(defn populate-folder
  "Populates a folder."
  [directory-path]
  (let [ids (atom {:question 0 :model 0 :metric 0 :snippet 0 :collection 0})
        ref->id (atom {})]
    (letfn [(id! [t] (-> ids (swap! update t dec) t))
            (populate [dir collection]
              (let [{yaml false subdirs true} (group-by File/.isDirectory
                                                        (.listFiles (io/file dir)))
                    ingested (into []
                                   (map (fn [file]
                                          (let [content (import/import-yaml file)
                                                ref (:ref content)
                                                instance (t2/instance :model/Card (yaml->toucan content))
                                                id (id! :question)]
                                            (swap! ref->id assoc ref id)
                                            (assoc instance :id id :collection_id (:id collection)))))
                                   yaml)]
                (apply merge-with into
                       {:question ingested
                        :collection [collection]}
                       (for [subdir subdirs
                             :let [collection' (t2/instance :model/Collection
                                                            {:name (.getName (io/file subdir))
                                                             :id (id! :collection)
                                                             :slug (.getName (io/file subdir))
                                                             :location (str (:location collection) (:id collection) "/")})]]
                         (populate subdir collection')))))
            (fix-refs [ingested refs->id]
              ;; must be a prewalk since we look down one level for card references
              (walk/prewalk
               (let [ref-map? (fn [x]
                                (and (map? x) (= 1 (count x)) (string? (:ref x))))]
                 (fn [x] (cond
                           ;; look ahead for {:source-table {:ref "124"}} to become {:source-table "card__1234"}
                           (and (map? x) (ref-map? ((some-fn :source-table :source_table) x)))
                           (merge x
                                  {:source-table (format "card__%d" (refs->id (:ref ((some-fn :source-table :source_table) x))))})

                           (ref-map? x) (refs->id (:ref x))
                           :else x)))
               ingested))]
      (let [dir (io/file directory-path)]
        (if-not (.exists dir)
          (throw (ex-info (format "Directory does not exist: %s" directory-path) {:directory directory-path}))
          (let [collection (t2/instance :model/Collection {:name (.getName (io/file directory-path))
                                                           :id (id! :collection)
                                                           :slug (.getName (io/file directory-path))
                                                           :location "/"})
                instances (populate dir collection)]
            (fix-refs instances @ref->id)))))))

(defonce ^{:doc "Atom holding statically loaded assets for experimental features."} static-assets
  (atom nil))

(defn set-static-assets
  "Set 'em"
  [folder]
  (if-not (.exists (io/file folder))
    (log/errorf "Folder %s does not exist" folder)
    (let [assets (populate-folder folder)]
      (reset! static-assets assets))))

(defn fetch
  "Fetch 'em"
  [model id]
  (->> @static-assets model (some (fn [x] (when (= (:id x) id) x)))))

(defn record-metadata
  "Record it all"
  [id metadata]
  (swap! static-assets
         update
         :question
         (fn [qs] (into [] (map (fn [q]
                                  (if (= (:id q) id)
                                    (assoc q :results_metadata metadata)
                                    q)))
                        qs))))
(defn collections
  "Collections, yo."
  []
  (:collection @static-assets))

(defn collection-items
  "Masterpieces."
  [id]
  (->> @static-assets :question (filter (comp #{id} :collection_id)) (map (fn [c] (assoc c :model "card")))))

(comment
  (pst)
  (import/yaml->toucan (load-representation-yaml "/tmp/pre-loaded/c-2-card196324.card.yml") nil)
  (ingest-representation (clj-yaml/parse-string (slurp "/tmp/pre-loaded/c-2-card196324.card.yml")))
  (file-seq (io/file "/tmp/pre-loaded"))
  (fetch :collection -1)
  (populate-folder "/tmp/pre-loaded")
  (set-static-assets "/tmp/pre-loaded")
  (set-static-assets "/tmp/swaperoo")
  (reset! static-assets nil)
  (t2/instance :model/Collection {:name "preloaded"
                                  :slug "preloaded"
                                  :location "/"
                                  :created_at (java.time.OffsetDateTime/now)})
  (type *1)
  (t2/select-one :model/Collection :id 2))

(defn export-collection-representations
  "Export a collection and all its contents to YAML files.
   Delegates to export/export-collection-representations."
  ([id]
   (export/export-collection-representations id))
  ([id path]
   (export/export-collection-representations id path)))

(defn import-collection-representations
  "Because I didn't potemkin yet."
  [id]
  (import/import-collection-representations id))

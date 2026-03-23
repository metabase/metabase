(ns metabase-enterprise.checker.format.hybrid
  "Hybrid format support - concise database metadata with serdes cards.

   This namespace provides:
   1. Format detection - automatically detect concise vs serdes format
   2. Hybrid source - combine concise DB metadata with serdes cards
   3. Unified API - single entry point regardless of format

   Directory structure detection:

   CONCISE format (databases are single files):
     databases/
       my-database.yaml      <- file, contains tables/schemas inline
       another-database.yaml
     collections/            <- serdes format for cards
       ...

   SERDES format (databases are directories):
     databases/
       my-database/          <- directory
         my-database.yaml
         schemas/
           public/
             tables/
               users/
                 users.yaml
                 fields/
                   id.yaml
     collections/
       ..."
  (:require
   [clojure.java.io :as io]
   [metabase-enterprise.checker.format.concise :as concise]
   [metabase-enterprise.checker.format.lenient :as lenient]
   [metabase-enterprise.checker.format.serdes :as serdes]
   [metabase-enterprise.checker.source :as source])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

;;; ===========================================================================
;;; Format Detection
;;; ===========================================================================

(defn detect-database-format
  "Detect the format of the databases directory.

   Returns:
   - :concise if databases/ contains .yaml files directly
   - :serdes if databases/ contains subdirectories
   - nil if databases/ doesn't exist or is empty"
  [export-dir]
  (let [^File db-dir (io/file export-dir "databases")]
    (when (.exists db-dir)
      (let [children (.listFiles db-dir)]
        (cond
          ;; Check for .yaml files directly in databases/
          (some #(and (.isFile ^File %)
                      (.endsWith (.getName ^File %) ".yaml"))
                children)
          :concise

          ;; Check for subdirectories (serdes format)
          (some #(.isDirectory ^File %) children)
          :serdes

          :else nil)))))

(defn detect-format
  "Detect the overall format of an export directory.

   Returns a map:
   {:databases :concise|:serdes|nil
    :cards :serdes|nil}

   Cards are always in serdes format (in collections/ directory)."
  [export-dir]
  {:databases (detect-database-format export-dir)
   :cards (when (.exists (io/file export-dir "collections")) :serdes)})

;;; ===========================================================================
;;; Hybrid Source - Concise DBs + Serdes Cards
;;; ===========================================================================

(deftype HybridSource [concise-source serdes-source]
  ;; Uses concise source for database/table/field resolution
  ;; Uses serdes source for card resolution
  source/MetadataSource
  (resolve-database [_ db-name]
    (source/resolve-database concise-source db-name))

  (resolve-table [_ table-path]
    (source/resolve-table concise-source table-path))

  (resolve-field [_ field-path]
    (source/resolve-field concise-source field-path))

  (resolve-card [_ entity-id]
    (source/resolve-card serdes-source entity-id)))

(defn- make-concise-db-source
  "Create a concise source for just the databases (no cards)."
  [export-dir]
  (concise/make-source-from-data
   ;; Load database YAML files
   (let [^File db-dir (io/file export-dir "databases")]
     (when (.exists db-dir)
       (for [^File file (.listFiles db-dir)
             :when (.isFile file)
             :when (.endsWith (.getName file) ".yaml")]
         (concise/load-yaml (.getPath file)))))
   ;; No cards from concise source
   []))

(defn make-hybrid-source
  "Create a hybrid source: concise format for DBs, serdes format for cards.

   export-dir should have:
     databases/
       db1.yaml  (concise format)
       db2.yaml
     collections/
       ...       (serdes format cards)"
  [export-dir]
  (let [concise-src (make-concise-db-source export-dir)
        serdes-src (serdes/make-source export-dir)]
    (->HybridSource concise-src serdes-src)))

;;; ===========================================================================
;;; Hybrid Enumeration
;;; ===========================================================================

(defn hybrid-all-database-names
  "Get all database names from hybrid source."
  [^HybridSource source]
  (concise/all-database-names (.-concise-source source)))

(defn hybrid-all-table-paths
  "Get all table paths from hybrid source."
  [^HybridSource source]
  (concise/all-table-paths (.-concise-source source)))

(defn hybrid-all-field-paths
  "Get all field paths from hybrid source."
  [^HybridSource source]
  (concise/all-field-paths (.-concise-source source)))

(defn hybrid-all-card-ids
  "Get all card entity-ids from hybrid source."
  [^HybridSource source]
  (serdes/all-card-ids (.-serdes-source source)))

(defn make-hybrid-enumerators
  "Create enumerators map for hybrid source."
  [source]
  {:databases #(hybrid-all-database-names source)
   :tables    #(hybrid-all-table-paths source)
   :fields    #(hybrid-all-field-paths source)
   :cards     #(hybrid-all-card-ids source)})

;;; ===========================================================================
;;; Unified API - Auto-detect and create appropriate source
;;; ===========================================================================

(defn- make-lenient-source
  "Create a lenient source, using serdes for cards if collections/ exists."
  [export-dir format]
  (let [serdes-src (when (= :serdes (:cards format))
                     (serdes/make-source export-dir))
        source     (lenient/make-source serdes-src)]
    {:source source
     :format format
     :type   :lenient}))

(defn make-source
  "Create a MetadataSource from an export directory, auto-detecting format.

   Supports:
   - Pure serdes format (databases as directories)
   - Pure concise format (databases as files, cards in cards/)
   - Hybrid format (concise databases, serdes cards in collections/)
   - Lenient format (no databases on disk, fabricate metadata on demand)

   Pass :lenient? true to force lenient mode regardless of what's on disk.

   Returns the source and format info."
  [export-dir & {:keys [lenient?]}]
  (let [format (detect-format export-dir)]
    (if lenient?
      (make-lenient-source export-dir format)
      (case (:databases format)
        :serdes
        {:source (serdes/make-source export-dir)
         :format format
         :type :serdes}

        :concise
        (if (= :serdes (:cards format))
          ;; Hybrid: concise DBs + serdes cards
          {:source (make-hybrid-source export-dir)
           :format format
           :type :hybrid}
          ;; Pure concise (cards in cards/ directory)
          {:source (concise/make-source export-dir)
           :format format
           :type :concise})

        ;; No databases found — use lenient source that fabricates metadata
        (make-lenient-source export-dir format)))))

(defn make-enumerators
  "Create enumerators for any source type returned by make-source."
  [{:keys [source type]}]
  (case type
    :serdes  (serdes/make-enumerators source)
    :concise (concise/make-enumerators source)
    :hybrid  (make-hybrid-enumerators source)
    :lenient (let [delegate (lenient/card-source source)]
               (lenient/make-enumerators
                source
                (when delegate
                  #(serdes/all-card-ids delegate))))))

(defn check
  "Check all cards using auto-detected format.

   Returns a map:
     {:results  {entity-id -> result}
      :type     :serdes|:concise|:hybrid|:lenient
      :source   the MetadataSource used}

   Pass :lenient? true to force lenient mode.

   When the source is :lenient, callers can use
   `lenient/build-manifest` and `lenient/write-manifest!` on the source."
  [export-dir & {:keys [lenient?]}]
  (let [{:keys [source type] :as src-info} (make-source export-dir :lenient? lenient?)
        enums    (make-enumerators src-info)
        card-ids ((:cards enums))
        checker  (requiring-resolve 'metabase-enterprise.checker.checker/check-cards)]
    {:results (checker source enums card-ids)
     :type    type
     :source  source}))

(comment
  ;; Auto-detect and check
  (def results (check "/path/to/export"))

  ;; Or manually create hybrid source
  (def src (make-hybrid-source "/path/to/export"))
  (def enums (make-hybrid-enumerators src))

  ;; Check format
  (detect-format "/path/to/export")
  ;; => {:databases :concise, :cards :serdes}
  )

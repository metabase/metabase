(ns metabase-enterprise.checker.format.serdes
  "Serdes export format - directory structure, path parsing, entity loading.

   Directory structure:
     databases/<db-name>/<db-name>.yaml
     databases/<db-name>/schemas/<schema>/tables/<table>/<table>.yaml
     databases/<db-name>/schemas/<schema>/tables/<table>/fields/<field>.yaml
     databases/<db-name>/tables/<table>/<table>.yaml           # schema-less (SQLite)
     databases/<db-name>/tables/<table>/fields/<field>.yaml    # schema-less
     collections/<entity-id>_<slug>/<entity-id>_<slug>.yaml
     collections/.../cards/<entity-id>_<slug>.yaml
     collections/.../dashboards/<entity-id>_<slug>.yaml"
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.checker.source :as source]
   [metabase.util.yaml :as yaml])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

;;; ===========================================================================
;;; Path Parsing - Infer entity type from file path
;;; ===========================================================================

(defn infer-entity-type
  "Infer entity type from file path. Returns keyword or nil."
  [^String path]
  (cond
    (re-find #"/databases/[^/]+/[^/]+\.yaml$" path) :database
    (re-find #"/tables/[^/]+/[^/]+\.yaml$" path) :table
    (re-find #"/fields/[^/]+\.yaml$" path) :field
    (re-find #"/cards/[^/]+\.yaml$" path) :card
    (re-find #"/dashboards/[^/]+\.yaml$" path) :dashboard
    (re-find #"/collections/[^/]+/[^/]+\.yaml$" path) :collection
    :else nil))

;;; ===========================================================================
;;; YAML Loading
;;; ===========================================================================

(defn load-yaml
  "Load and parse a YAML file."
  [path]
  (yaml/parse-string (slurp path)))

(defn quick-extract
  "Extract a field from YAML using regex (fast) with full parse fallback."
  [file-path field-name pattern]
  (try
    (let [content (slurp file-path)]
      (if-let [[_ value] (re-find pattern content)]
        (str/trim value)
        (get (yaml/parse-string content) (keyword field-name))))
    (catch Exception _ nil)))

(defn extract-name [file-path]
  (quick-extract file-path "name" #"(?m)^name:\s*(.+)$"))

(defn extract-entity-id [file-path]
  (quick-extract file-path "entity_id" #"(?m)^entity_id:\s*(\S+)"))

;;; ===========================================================================
;;; File Walking - Build index of all entities
;;; ===========================================================================

(defn walk-yaml-files
  "Walk export directory and call (f file-path entity-type) for each YAML file.
   Returns nil, used for side effects."
  [export-dir f]
  (doseq [^File file (file-seq (io/file export-dir))
          :when (.isFile file)
          :when (str/ends-with? (.getName file) ".yaml")
          :let [path (.getPath file)
                entity-type (infer-entity-type path)]
          :when entity-type]
    (f path entity-type)))

;;; ---------------------------------------------------------------------------
;;; Database tree indexing
;;;
;;; The serdes database directory has a regular, recursive structure that we
;;; describe as data and interpret with a single walker.
;;;
;;; Layout grammar (each step is a vector):
;;;
;;;   [:dir "name" & children]     — descend into literal subdirectory "name"
;;;   [:each & children]           — iterate subdirs, capture dir-name into ref
;;;   [:entity :kind]              — <dirname>.yaml here is an entity of :kind
;;;   [:files :kind]               — each .yaml file here is an entity of :kind
;;;   [:maybe & children]          — like progn, but ok if directory is missing
;;;   [:insert val & children]     — push a literal value into the ref (e.g. nil for schema)
;;;
;;; The walker accumulates captured names into a `ref` vector as it descends.
;;; When it hits :entity or :files, it emits {:kind :ref :file} index entries.
;;; ---------------------------------------------------------------------------

(def ^:private table-layout
  "Shared layout for a table directory and its fields."
  [:each
   [:entity :table]
   [:maybe [:dir "fields" [:files :field]]]])

(def ^:private database-layout
  "Layout descriptor for the databases/ tree."
  [:dir "databases"
   [:each                                           ; <db-name>/
    [:entity :database]                             ;   <db-name>.yaml
    [:maybe                                         ;   with schemas:
     [:dir "schemas"
      [:each                                        ;     <schema>/
       [:dir "tables" table-layout]]]]
    [:maybe                                         ;   without schemas (schema-less):
     [:dir "tables"
      [:insert nil table-layout]]]]])

(defn- subdirs
  "Subdirectories of `dir`, or [] if it doesn't exist."
  [^File dir]
  (if (.isDirectory dir)
    (filterv #(.isDirectory ^File %) (.listFiles dir))
    []))

(defn- walk-layout
  "Interpret a layout descriptor against `dir`, accumulating captured names in `ref`.
   Returns a lazy seq of {:kind :ref :file} index entries."
  [^File dir ref layout]
  (let [op       (first layout)
        ;; :dir, :entity, :files, :insert take an arg; :each, :maybe do not
        has-arg? (#{:dir :entity :files :insert} op)
        arg      (when has-arg? (second layout))
        children (if has-arg? (nnext layout) (next layout))]
    (case op
      :dir
      (let [child-dir (io/file dir ^String arg)]
        (when (.isDirectory child-dir)
          (mapcat #(walk-layout child-dir ref %) children)))

      :each
      (for [^File child-dir (subdirs dir)
            :let [name (.getName child-dir)
                  ref' (conj ref name)]
            entry (mapcat #(walk-layout child-dir ref' %) children)]
        entry)

      :entity
      (let [name (.getName dir)
            f    (io/file dir (str name ".yaml"))]
        (when (.isFile f)
          [{:kind arg :ref (if (= 1 (count ref)) (first ref) ref) :file (.getPath f)}]))

      :files
      (for [^File f (.listFiles dir)
            :when (.isFile f)
            :let  [fname (.getName f)]
            :when (str/ends-with? fname ".yaml")
            :when (not (str/includes? fname "___"))
            :let  [field-name (str/replace fname ".yaml" "")]]
        {:kind arg :ref (conj ref field-name) :file (.getPath f)})

      :insert
      (mapcat #(walk-layout dir (conj ref arg) %) children)

      :maybe
      (when (.isDirectory dir)
        (mapcat #(walk-layout dir ref %) children))

      nil)))

(defn- index-entity-id-files
  "Index entries for cards/dashboards found by walking the file tree.
   Assigns `kind` to each file whose path matches `pattern`."
  [export-dir kind pattern]
  (for [^File file (file-seq (io/file export-dir))
        :when (.isFile file)
        :let  [path (.getPath file)]
        :when (re-find pattern path)
        :let  [entity-id (extract-entity-id path)]
        :when entity-id]
    {:kind kind :ref entity-id :file path}))

(defn build-file-index
  "Build index of all entity files in an export directory.
   Returns `{kind {ref file-path}}` where kind is :database, :table, :field,
   :card, or :dashboard."
  [export-dir]
  (let [entries (concat
                 (walk-layout (io/file export-dir) [] database-layout)
                 (index-entity-id-files export-dir :card      #"/cards/[^/]+\.yaml$")
                 (index-entity-id-files export-dir :dashboard #"/dashboards/[^/]+\.yaml$"))]
    (reduce (fn [idx {:keys [kind ref file]}]
              (assoc-in idx [kind ref] file))
            {}
            entries)))

(def ^:private databases-dir-layout
  "Layout descriptor for a directory that IS the databases directory.
   Unlike `database-layout`, this does not expect a `databases/` subdirectory —
   the directory itself contains database subdirectories directly."
  [:each                                             ; <db-name>/
   [:entity :database]                               ;   <db-name>.yaml
   [:maybe                                           ;   with schemas:
    [:dir "schemas"
     [:each                                          ;     <schema>/
      [:dir "tables" table-layout]]]]
   [:maybe                                           ;   without schemas (schema-less):
    [:dir "tables"
     [:insert nil table-layout]]]])

(defn build-database-dir-index
  "Build index of database/table/field entities from a directory that IS the
   databases directory (contains db subdirectories directly, no `databases/` prefix).

   Returns `{kind {ref file-path}}` with :database, :table, :field entries."
  [databases-dir]
  (let [entries (walk-layout (io/file databases-dir) [] databases-dir-layout)]
    (reduce (fn [idx {:keys [kind ref file]}]
              (assoc-in idx [kind ref] file))
            {}
            entries)))

(defn index-stats
  "Get statistics about a file index."
  [index]
  {:databases      (count (:database index))
   :tables         (count (:table index))
   :fields         (count (:field index))
   :cards          (count (:card index))
   :dashboards     (count (:dashboard index))
   :database-names (vec (keys (:database index)))})

;;; ===========================================================================
;;; MetadataSource Implementation
;;;
;;; Returns raw YAML data - the checker handles conversion to lib format.
;;; This keeps format knowledge here, lib knowledge in checker.
;;; ===========================================================================

(deftype SerdesSource [export-dir index]
  source/MetadataSource
  (resolve-database [_ db-name]
    (when-let [file (get-in index [:database db-name])]
      (load-yaml file)))

  (resolve-table [_ table-path]
    (when-let [file (get-in index [:table table-path])]
      (load-yaml file)))

  (resolve-field [_ field-path]
    (when-let [file (get-in index [:field field-path])]
      (load-yaml file)))

  (resolve-card [_ entity-id]
    (when-let [file (get-in index [:card entity-id])]
      (load-yaml file))))

(defn make-source
  "Create a MetadataSource for a serdes export directory."
  [export-dir]
  (->SerdesSource export-dir (build-file-index export-dir)))

(defn make-database-source
  "Create a MetadataSource for a directory that IS the databases directory.
   The directory should contain database subdirectories directly (e.g., `Sample Database/`).
   This source only resolves databases, tables, and fields — not cards."
  [databases-dir]
  (->SerdesSource databases-dir (build-database-dir-index databases-dir)))

(defn source-index
  "Get the file index from a SerdesSource."
  [^SerdesSource source]
  (.-index source))

(defn source-export-dir
  "Get the export directory from a SerdesSource."
  [^SerdesSource source]
  (.-export-dir source))

;;; ===========================================================================
;;; Enumeration
;;; ===========================================================================

(defn all-card-ids
  "Get all card entity-ids from source."
  [^SerdesSource source]
  (keys (:card (.-index source))))

(defn all-database-names
  "Get all database names from source."
  [^SerdesSource source]
  (keys (:database (.-index source))))

(defn all-table-paths
  "Get all table paths from source."
  [^SerdesSource source]
  (keys (:table (.-index source))))

(defn all-field-paths
  "Get all field paths from source."
  [^SerdesSource source]
  (keys (:field (.-index source))))


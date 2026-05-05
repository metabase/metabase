(ns metabase-enterprise.data-complexity-score.representation
  "Load a serdes export directory into the shape the complexity scorer expects.

  Format: the official Metabase serdes/representation YAML, byte-compatible with what
  `serdes/store` emits and what `metabase-enterprise.checker` parses.

  Layout (subset that the scorer reads):

      <dir>/databases/<db>/<db>.yaml                 (Database metadata; `is_audit: true` excludes the DB)
      <dir>/databases/<db>/schemas/<schema>/tables/<table>/<table>.yaml
      <dir>/databases/<db>/schemas/<schema>/tables/<table>/fields/<field>.yaml
      <dir>/databases/<db>/schemas/<schema>/tables/<table>/measures/<measure>.yaml
      <dir>/databases/<db>/tables/<table>/...        (schema-less variant)
      <dir>/collections/<coll>/<coll>.yaml           (Collection metadata; type: library marks the root)
      <dir>/collections/<coll>/cards/<card>.yaml
      <dir>/embeddings.json                          (sidecar — not part of the serdes spec)

  Library membership is derived from `Collection.type = \"library\"` plus the `parent_id` chain.

  Caveats vs. the live appdb scorer in [[metabase-enterprise.data-complexity-score.complexity]]:
    - `:metabot` catalog: requires premium-feature gates and a Metabot config row that aren't in
      an export. The CLI flags `:metabot` as a universe fallback (see `cli/run-cli`)."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.data-complexity-score.complexity-embedders :as embedders]
   [metabase.collections.core :as collections]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.yaml :as yaml])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------- file walking -------------------------------------------

(defn- yaml-file? [^File f]
  (and (.isFile f) (str/ends-with? (.getName f) ".yaml")))

(defn- list-dirs [^File dir]
  (if (.isDirectory dir) (filterv #(.isDirectory ^File %) (.listFiles dir)) []))

(defn- list-yamls [^File dir]
  (if (.isDirectory dir) (filterv yaml-file? (.listFiles dir)) []))

(defn- entity-model
  "Read the serdes model name (e.g. \"Collection\", \"Card\") from a parsed YAML map.
  Returns nil for files without a `serdes/meta` block."
  [yaml-map]
  (some-> yaml-map (get :serdes/meta) last :model))

(defn- load-yaml [^File f]
  (yaml/parse-string (slurp f)))

;;; ------------------------------------- collections + cards -------------------------------------

(defn- walk-collections-tree
  "Walk `collections/` and bucket by serdes model.
  Returns `{:collections [...] :cards [...]}`; everything else (Dashboard, Document, Snippet,
  Transform, Segment, Measure) is ignored — measures live under the database tree."
  [^File collections-dir]
  (if (.isDirectory collections-dir)
    (reduce
     (fn [acc ^File f]
       (let [parsed (load-yaml f)]
         (case (entity-model parsed)
           "Collection" (update acc :collections conj parsed)
           "Card"       (update acc :cards conj parsed)
           acc)))
     {:collections [] :cards []}
     (filter yaml-file? (file-seq collections-dir)))
    {:collections [] :cards []}))

(defn- library-collection-ids
  "Set of collection entity_ids in the Library subtree — root + every descendant reachable via
  the `parent_id` chain. Empty when no library-typed collection exists."
  [collections]
  (if-let [root (u/seek #(= collections/library-collection-type (:type %)) collections)]
    (let [root-eid    (:entity_id root)
          parent-of   (into {} (map (juxt :entity_id :parent_id)) collections)
          in-library? (fn [eid]
                        (loop [cur eid, seen #{}]
                          (cond
                            (= cur root-eid)           true
                            (or (nil? cur) (seen cur)) false
                            :else                      (recur (parent-of cur) (conj seen cur)))))]
      (into #{root-eid}
            (keep #(when (in-library? (:entity_id %)) (:entity_id %)))
            collections))
    #{}))

;;; ------------------------------------- tables, fields, measures -------------------------------------

(defn- table-self-yaml
  "Path to the Table's self-named `<dir>.yaml` inside `table-dir`, or nil if missing."
  [^File table-dir]
  (let [f (io/file table-dir (str (.getName table-dir) ".yaml"))]
    (when (.exists f) f)))

(defn- list-table-dirs
  "All Table directories under one database — both schema-qualified and schema-less variants."
  [^File db-dir]
  (concat (mapcat (fn [^File schema-dir] (list-dirs (io/file schema-dir "tables")))
                  (list-dirs (io/file db-dir "schemas")))
          (list-dirs (io/file db-dir "tables"))))

(defn- database-self-yaml
  "Path to the Database's self-named `<db-dir>/<db-dir>.yaml`, or nil if missing."
  [^File db-dir]
  (let [f (io/file db-dir (str (.getName db-dir) ".yaml"))]
    (when (.exists f) f)))

(defn- audit-database-names
  "Set of database names whose self-yaml has `:is_audit true`. Mirrors the live appdb scorer's
  `[:not= audit/audit-db-id]` filter — the v2 serdes extract path doesn't exclude the audit DB,
  so anything in the export carrying `:is_audit true` would otherwise inflate `:universe`."
  [^File databases-dir]
  (if (.isDirectory databases-dir)
    (into #{}
          (keep (fn [^File db-dir]
                  (when-let [self (database-self-yaml db-dir)]
                    (let [parsed (load-yaml self)]
                      (when (true? (:is_audit parsed))
                        (:name parsed))))))
          (list-dirs databases-dir))
    #{}))

(defn- load-yamls-of-model
  "Parse YAMLs in `dir` and keep only those whose serdes model equals `model`.
  Serdes co-locates side-car models in the same directory — e.g. FieldValues and FieldUserSettings
  live next to Field YAMLs under `fields/` (`<field>___fieldvalues.yaml`,
  `<field>___fieldusersettings.yaml`). The `___` separator is a serdes invariant, so we skip those
  filenames before parsing — both to avoid inflating `:field-count` and to avoid the parse cost on
  the 2N side-cars that would be discarded anyway."
  [dir model]
  (->> (list-yamls dir)
       (remove #(str/includes? (.getName ^File %) "___"))
       (into [] (comp (map load-yaml) (filter #(= model (entity-model %)))))))

(defn- load-table
  "Load one Table directory into `{:table :fields :measures}`, or nil if its self-yaml is missing."
  [^File table-dir]
  (when-let [self (table-self-yaml table-dir)]
    {:table    (load-yaml self)
     :fields   (load-yamls-of-model (io/file table-dir "fields")   "Field")
     :measures (load-yamls-of-model (io/file table-dir "measures") "Measure")}))

(defn- walk-databases-tree
  "Walk `<dir>/databases/<db>/...` and return one `{:table :fields :measures}` per Table dir."
  [^File databases-dir]
  (if (.isDirectory databases-dir)
    (vec (keep load-table (mapcat list-table-dirs (list-dirs databases-dir))))
    []))

;;; ------------------------------------------- entity shaping -------------------------------------------

(defn- table-path-id
  "Stable `:id` for a Table, since serdes Table YAMLs carry no entity_id.
  Format: `\"<db>/<schema>/<name>\"`; `<schema>` is the empty string for schema-less databases."
  [{:keys [db_id schema name]}]
  (str db_id "/" (or schema "") "/" name))

(defn- ->table-entity [{:keys [table fields measures]}]
  ;; Field.active defaults to true and Measure.archived defaults to false: treat both missing
  ;; AND explicit nil as the default, so only an explicit `false`/`true` flips the predicate.
  {:id            (table-path-id table)
   :name          (:name table)
   :kind          :table
   :field-count   (count (remove #(false? (:active %)) fields))
   :measure-names (mapv :name (remove #(true? (:archived %)) measures))})

(defn- ->card-entity [{:keys [entity_id name type]}]
  {:id            entity_id
   :name          name
   :kind          (keyword type)
   :field-count   0
   :measure-names []})

;;; ------------------------------------------- embeddings sidecar -------------------------------------------

(defn- resolve-embeddings-file
  "Resolve `embeddings-path` against `dir` (relative paths) or as-is (absolute).
  Throws ex-info when the file is missing — silent fallback would mask a typo and produce a
  misleadingly low score."
  ^File [dir embeddings-path]
  (let [given (io/file embeddings-path)
        f     (if (.isAbsolute given) given (io/file dir embeddings-path))]
    (when-not (.exists f)
      (throw (ex-info (str "Embeddings file not found: " (.getPath f))
                      {:embeddings-path embeddings-path
                       :resolved-path   (.getPath f)
                       :dir             (str dir)})))
    f))

(defn- load-embeddings
  "Decode the embeddings sidecar — explicit override, then default `embeddings.json`, else `{}`."
  [dir embeddings-path]
  (if embeddings-path
    (json/decode (slurp (resolve-embeddings-file dir embeddings-path)) false)
    (let [default (io/file dir "embeddings.json")]
      (if (.exists default) (json/decode (slurp default) false) {}))))

;;; ------------------------------------------- public entry point -------------------------------------------

(defn load-dir
  "Load a serdes export and return `{:library :universe :embedder}` for the complexity scorer.

  Filters mirror the live appdb scorer:
    - Universe Cards : `type ∈ {metric model}`, not archived
    - Universe Tables: `active` (defaults true)
    - Library Cards  : Universe Card whose `collection_id` is in the Library subtree
    - Library Tables : Universe Table with `is_published true` and `collection_id` in the Library

  Options:
    `:embeddings-path` — explicit JSON embeddings file. Relative paths resolve against `dir`.
      Throws when the resolved file is missing. Defaults to `<dir>/embeddings.json` when absent."
  [dir & {:keys [embeddings-path]}]
  (let [dir-file        (io/file dir)
        databases-dir   (io/file dir-file "databases")
        {:keys [collections cards]} (walk-collections-tree (io/file dir-file "collections"))
        tables          (walk-databases-tree databases-dir)
        embeddings      (load-embeddings dir embeddings-path)
        lib-coll-ids    (library-collection-ids collections)
        audit-db-names  (audit-database-names databases-dir)
        non-audit-card?  (fn [c] (not (contains? audit-db-names (:database_id c))))
        non-audit-table? (fn [t] (not (contains? audit-db-names (:db_id t))))
        ;; In serdes: Card.archived is in :copy without a default → absent means false.
        ;; Field.active defaults to true; Measure.archived defaults to false (in shapers).
        universe-card?  (fn [c] (and (contains? #{"metric" "model"} (:type c))
                                     (not (get c :archived false))
                                     (non-audit-card? c)))
        library-card?   (fn [c] (and (universe-card? c)
                                     (contains? lib-coll-ids (:collection_id c))))
        universe-table? (fn [{t :table}]
                          (and (get t :active true)
                               (non-audit-table? t)))
        library-table?  (fn [{t :table :as bundle}]
                          (and (universe-table? bundle)
                               (:is_published t)
                               (contains? lib-coll-ids (:collection_id t))))]
    {:library  (vec (concat (mapv ->card-entity  (filter library-card?  cards))
                            (mapv ->table-entity (filter library-table? tables))))
     :universe (vec (concat (mapv ->card-entity  (filter universe-card?  cards))
                            (mapv ->table-entity (filter universe-table? tables))))
     :embedder (embedders/file-embedder embeddings)}))

(ns metabase-enterprise.remote-sync.merge
  "Three-way merge of serialized remote-sync content, keyed on serdes identity (model + id) rather than
  on-disk file path.

  Why identity and not path: the storage path is derived from entity *names* and the names of the
  collections containing them (see [[metabase-enterprise.serialization.v2.storage.util/resolve-storage-path]]),
  so renaming or moving an entity changes its file path. A path-keyed merge would therefore treat a rename
  as delete+add and could produce two files with the same entity_id (silent corruption) or report false
  conflicts when a collection is renamed on one side. Keying on the stable serdes identity avoids all of
  that and gives true per-entity conflict semantics.

  The merge takes three sides:
  - `base`   - the last successfully synced state (the merge base)
  - `ours`   - the freshly serialized local state to be exported
  - `theirs` - the current remote tip

  and produces a merged set of file specs plus a list of genuine conflicts (the same entity changed
  differently on both sides)."
  (:require
   [clojure.string :as str]
   [metabase.models.serialization :as serdes]
   [metabase.util.log :as log]
   [metabase.util.yaml :as yaml]))

(set! *warn-on-reflection* true)

(defn- parse-entity
  "The parsed YAML `content` of a serialized entity file, or nil if it can't be parsed."
  [content]
  (try
    (yaml/parse-string content)
    (catch Exception e
      ;; A serialized entity that won't parse is abnormal (malformed/partially-written file) and demotes
      ;; this side to a path key while the other side stays identity-keyed — which reads as a phantom
      ;; add+remove rather than an update. Warn so it's visible rather than silently mis-merged.
      (log/warnf "Could not parse serialized content during merge; treating it as a non-serdes (path-keyed) file: %s" (ex-message e))
      nil)))

(defn- entity-identity
  "Returns a stable, rename-independent identity key for a parsed serialized `entity`, or nil if it has no serdes
  path. The key is a vector of `[model id]` pairs (the serdes path with labels dropped)."
  [entity]
  (when (map? entity)
    (some->> (serdes/path entity)
             seq
             (mapv (fn [seg] [(str (:model seg)) (str (:id seg))])))))

(defn- parent-dir [^String path]
  (when-let [idx (str/last-index-of path "/")]
    (subs path 0 idx)))

(defn- declared-resource-paths
  "The repo paths of the resource files that the parsed `entity` of the YAML file at `path` declares."
  [path entity]
  (let [dir (parent-dir path)]
    (try
      (into [] (comp (filter string?) (map #(str dir "/" %))) (serdes/resource-paths entity))
      (catch Exception e
        (log/warnf "Could not read the resource files that %s declares during merge: %s" path (ex-message e))
        nil))))

(defn- resource-owners
  "Map of resource path -> identity key of the entity that owns it, for `entries` of `{:key :spec :resource-paths}`. A
  resource file belongs to the entity YAML file that declares it; when YAML files in several ancestor directories
  declare it, the one in the nearest directory owns it."
  [entries]
  (let [claims (reduce (fn [acc {k :key {:keys [path]} :spec resource-paths :resource-paths}]
                         (reduce (fn [acc resource-path]
                                   (let [depth (count (parent-dir path))]
                                     (if (some-> (get acc resource-path) :depth (>= depth))
                                       acc
                                       (assoc acc resource-path {:depth depth :key k}))))
                                 acc
                                 resource-paths))
                       {}
                       (filter :key entries))]
    (update-vals claims :key)))

(defn- unit-specs
  "The `{:path :content}` specs of every file of a load unit from [[index-by-key]]: its main file, then its resource
  files."
  [unit]
  (cons (select-keys unit [:path :content]) (:resources unit)))

(defn- index-by-key
  "Builds a map of identity-key -> load unit for a sequence of file specs. A load unit is the `{:path :content}` of an
  entity's YAML file, with `:resources`, the `{:path :content}` specs of the resource files it declares sorted by
  path, when it has any. A file that is neither an entity YAML file nor a declared resource file is a unit of its
  own, under a path-based key.

  Throws if two specs on the same side share a serdes identity (the same model + entity_id at two
  paths): silently keeping one would drop the other, which is data corruption, so a duplicate entity_id
  is surfaced as an error. A duplicate path (two files at the same path, which a real tree shouldn't contain) only
  warns and keeps the last."
  [specs]
  (let [;; keep only what the index needs of each parsed entity, so that the parsed maps of a side are not all live
        ;; at once
        entries   (mapv (fn [{:keys [^String path content] :as spec}]
                          (let [entity (when (str/ends-with? path ".yaml") (parse-entity content))
                                k      (entity-identity entity)]
                            {:key            k
                             :spec           (select-keys spec [:path :content])
                             :resource-paths (when k (declared-resource-paths path entity))}))
                        specs)
        owners    (resource-owners entries)
        units     (reduce (fn [acc {k :key {:keys [path] :as spec} :spec}]
                            (when (contains? acc k)
                              (throw (ex-info (format "Duplicate serdes identity %s during merge: paths %s and %s share the same entity_id"
                                                      k (:path (get acc k)) path)
                                              {:identity k
                                               :paths    [(:path (get acc k)) path]})))
                            (assoc acc k spec))
                          {}
                          (filter :key entries))
        ;; owner key -> path -> spec, for every file that is not an entity YAML file
        others    (reduce (fn [acc {{:keys [path] :as spec} :spec}]
                            (let [owner (get owners path [::by-path path])]
                              (when (contains? (get acc owner) path)
                                (log/warnf "Duplicate path %s during merge; keeping the last occurrence" path))
                              (assoc-in acc [owner path] spec)))
                          {}
                          (remove :key entries))]
    (reduce-kv (fn [acc owner specs-by-path]
                 (if (= ::by-path (first owner))
                   (assoc acc owner (val (first specs-by-path)))
                   (assoc-in acc [owner :resources] (mapv val (sort-by key specs-by-path)))))
               units
               others)))

(defn- same?
  "Two sides are the same when both are absent, or both present with equal path and content. Path equality
  matters so that a rename with otherwise identical content still counts as a change.

  On its own this reads as a local change every textual difference between a fresh serialization and the base,
  including ones nobody made locally (a descendant whose path moved because a parent collection was renamed, or a
  repo file not byte-identical to Metabase's serialization); the merge's `unchanged-locally?` check, which the
  remote-sync callers answer from the ledger, tells those apart (see [[three-way-merge]])."
  [a b]
  (= a b))

(defn conflict-label
  "Renders a single conflict from [[three-way-merge]] into a human-readable string for display, e.g.
  \"Card A (collections/foo/bar.yaml)\". Prefers the entity's name (parsed from the serialized content),
  falling back to its serdes model + id when there's no name."
  [{:keys [key ours theirs]}]
  (let [content    (or (:content ours) (:content theirs))
        entity     (try (yaml/parse-string content) (catch Exception _ nil))
        path       (or (:path ours) (:path theirs))
        ;; identity keys are [[model id] ...]; the path-fallback key is [::by-path path] for a non-serdes
        ;; file — don't destructure the path string into a "model"/"id" (which yields garbage like "s o").
        descriptor (if (= ::by-path (first key))
                     (or path "unknown file")
                     (let [[model id] (last key)] (str model " " id)))]
    (cond-> (or (:name entity) descriptor)
      (and path (not= descriptor path)) (str " (" path ")"))))

(defn- merge-indexed
  "[[three-way-merge]] over sides already indexed by [[index-by-key]].

  `unchanged-locally?` is called with the base and ours load units of an entity present on both sides whose texts
  differ, and returns true when the local entity has not changed since the sync the base records (see
  [[three-way-merge]]). Such an entity is not a local change: the remote's edit to it merges cleanly, and when the
  remote left it alone the fresh serialization is kept, as before."
  [b o t unchanged-locally?]
  (let [all-keys (into #{} (concat (keys b) (keys o) (keys t)))]
    (reduce
     (fn [acc k]
       (let [bv (get b k)
             ov (get o k)
             tv (get t k)
             ours-changed? (and (not (same? ov bv))
                                (not (and bv ov (unchanged-locally? bv ov))))
             theirs-changed? (not (same? tv bv))]
         (cond
           ;; neither side changed -> keep base (if present); an entity whose text differs from the base but that
           ;; is unchanged locally keeps its fresh serialization
           (and (not ours-changed?) (not theirs-changed?))
           (let [v (or ov bv)] (-> (cond-> acc v (update :merged into (unit-specs v))) (assoc-in [:decisions k] :keep)))

           ;; only ours changed -> take ours
           (and ours-changed? (not theirs-changed?))
           (-> (cond-> acc ov (update :merged into (unit-specs ov))) (assoc-in [:decisions k] :ours))

           ;; only theirs changed -> take theirs, and record it as folded-in remote change
           (and theirs-changed? (not ours-changed?))
           (-> (cond-> acc tv (update :merged into (unit-specs tv)))
               (assoc-in [:decisions k] :theirs)
               (update-in [:summary (cond (nil? bv) :added
                                          (nil? tv) :removed
                                          :else     :updated)]
                          inc))

           ;; both changed the same way -> take it (no conflict)
           (same? ov tv)
           (-> (cond-> acc ov (update :merged into (unit-specs ov))) (assoc-in [:decisions k] :same))

           ;; both changed differently -> conflict
           :else
           (update acc :conflicts conj {:key k :base bv :ours ov :theirs tv}))))
     {:merged        []
      :conflicts     []
      :summary       {:added 0 :updated 0 :removed 0}
      :decisions     {}
      :theirs-paths  (update-vals t :path)
      :theirs-unit-paths (update-vals t #(mapv :path (unit-specs %)))
      :ours-contents (update-vals o :content)
      :ours-paths    (update-vals o :path)
      :ours-units    o}
     all-keys)))

(defn three-way-merge
  "Three-way merge of serialized content keyed on serdes identity.

  `base`, `ours`, `theirs` are each sequences of `{:path :content}` file specs (base/theirs typically read
  from the corresponding git trees, ours freshly serialized from the app DB).

  An entity's YAML file and the resource files it declares (see [[serdes/resource-paths]]) are one load unit with
  one decision: a remote change to one file of the unit and a local change to another is a conflict.

  Returns a map:
  - `:merged`    - sequence of winning `{:path :content}` specs to write
  - `:conflicts` - sequence of `{:key :ours :theirs :base}` for entities changed differently on both sides; each
                   side is the `{:path :content}` of the entity's YAML file, with `:resources`, the specs of its
                   resource files, when it has any
  - `:summary`   - `{:added :updated :removed}` counts of remote-originated changes folded into the result
                   (i.e. changes coming from `theirs` that `ours` did not already have)
  - `:decisions` - identity key -> decision, for each entity not in `:conflicts`: `:keep` (neither side changed
                   it), `:ours` (only ours changed it), `:theirs` (only theirs changed it) or `:same` (both sides
                   made the same change)
  - `:theirs-paths`  - identity key -> path, for each entity in `theirs`
  - `:theirs-unit-paths` - identity key -> the paths of every file of its unit (the YAML file first), for each
                           entity in `theirs`
  - `:ours-contents` - identity key -> the content of the entity's YAML file, for each entity in `ours`
  - `:ours-paths`    - identity key -> path, for each entity in `ours`
  - `:ours-units`    - identity key -> load unit, for each entity in `ours`: the `{:path :content}` of its YAML file,
                       with `:resources`, the specs of its resource files sorted by path, when it has any. A unit has
                       the shape of a file spec, so [[metabase-enterprise.remote-sync.source/file-spec-hash]] hashes it
                       as the ledger hash does.

  `ours` is a fresh serialization, so it can differ from `base` for an entity nobody changed locally: the repo file
  may not be byte-identical to what Metabase writes (hand-written YAML, or a `name:` edited without renaming the
  file, since the path is derived from the name). `:unchanged-locally?`, called as `(unchanged-locally? base-unit
  ours-unit)` for such an entity, says whether the local entity is the one the base records; when it returns true
  the entity is not a local change. Each argument is a load unit, as in `:ours-units`; a predicate must take the
  `:resources` into account, or it misses a change to a resource file. The default treats every textual difference
  as a local change."
  [base ours theirs & {:keys [unchanged-locally?] :or {unchanged-locally? (constantly false)}}]
  (merge-indexed (index-by-key base) (index-by-key ours) (index-by-key theirs) unchanged-locally?))

(defn- casualties-indexed
  "[[force-push-casualties]] over sides already indexed by [[index-by-key]]."
  [b o t]
  (reduce-kv
   (fn [acc k tv]
     (let [ov (get o k)
           bv (get b k)]
       (cond
         ;; remote unchanged since base, or already matches ours -> nothing lost
         (or (same? tv bv) (same? tv ov)) acc
         (nil? ov) (update acc :deleted conj (conflict-label {:key k :theirs tv}))
         :else     (update acc :overwritten conj (conflict-label {:key k :ours ov :theirs tv})))))
   {:deleted [] :overwritten []}
   t))

(defn force-push-casualties
  "Remote content that a force push would discard. A force export rewrites every managed file from `ours`,
  so any change the remote made since the merge `base` is lost. Returns `{:deleted :overwritten}`, each a
  sequence of human-readable labels (see [[conflict-label]]):
  - `:deleted`     - entities present on the remote (`theirs`) but absent from `ours` (removed entirely)
  - `:overwritten` - entities present in both whose remote content, changed since `base`, differs from
                     what `ours` would write (the remote edit is replaced)

  Entities the remote hasn't touched since `base`, or whose remote content already equals `ours`, are not
  casualties — that's a routine push, not a loss. `base`, `ours`, `theirs` are sequences of
  `{:path :content}` specs."
  [base ours theirs]
  (casualties-indexed (index-by-key base) (index-by-key ours) (index-by-key theirs)))

(defn merge-with-casualties
  "[[three-way-merge]] with `:force-push-casualties` (see [[force-push-casualties]]) assoc'd, from one
  indexing pass per side. Indexing parses every document's YAML, so callers that need both use this rather
  than the two functions separately. `:unchanged-locally?` is as for [[three-way-merge]]."
  [base ours theirs & {:keys [unchanged-locally?] :or {unchanged-locally? (constantly false)}}]
  (let [b (index-by-key base)
        o (index-by-key ours)
        t (index-by-key theirs)]
    (assoc (merge-indexed b o t unchanged-locally?)
           :force-push-casualties (casualties-indexed b o t))))

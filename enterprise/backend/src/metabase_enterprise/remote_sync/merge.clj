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
   [metabase.models.serialization :as serdes]
   [metabase.util.log :as log]
   [metabase.util.yaml :as yaml]))

(set! *warn-on-reflection* true)

(defn- entity-identity
  "Returns a stable, rename-independent identity key for a serialized entity's YAML `content`, or nil if the
  content can't be parsed or has no serdes path. The key is a vector of `[model id]` pairs (the serdes path
  with labels dropped)."
  [content]
  (try
    (some->> (yaml/parse-string content)
             serdes/path
             seq
             (mapv (fn [seg] [(str (:model seg)) (str (:id seg))])))
    (catch Exception e
      ;; A serialized entity that won't parse is abnormal (malformed/partially-written file) and demotes
      ;; this side to a path key while the other side stays identity-keyed — which reads as a phantom
      ;; add+remove rather than an update. Warn so it's visible rather than silently mis-merged.
      (log/warn e "Could not parse serialized content during merge; treating it as a non-serdes (path-keyed) file")
      nil)))

(defn- file-key
  "Identity key for a `{:path :content}` file spec: the serdes identity when available, otherwise a
  path-based fallback so non-serdes files still merge sanely."
  [{:keys [path content]}]
  (or (entity-identity content)
      [::by-path path]))

(defn- index-by-key
  "Builds a map of identity-key -> `{:path :content}` for a sequence of file specs.

  Throws if two specs on the same side share a serdes identity (the same model + entity_id at two
  paths): silently keeping one would drop the other, which is data corruption, so a duplicate entity_id
  is surfaced as an error. A duplicate path-fallback key (two non-serdes files at the same path, which a
  real tree shouldn't contain) only warns and keeps the last."
  [specs]
  (persistent!
   (reduce (fn [acc {:keys [path] :as spec}]
             (let [k (file-key spec)]
               (when (contains? acc k)
                 (if (= ::by-path (first k))
                   (log/warnf "Duplicate path %s during merge; keeping the last occurrence" path)
                   (throw (ex-info (format "Duplicate serdes identity %s during merge: paths %s and %s share the same entity_id"
                                           k (:path (get acc k)) path)
                                   {:identity k
                                    :paths    [(:path (get acc k)) path]}))))
               (assoc! acc k (select-keys spec [:path :content]))))
           (transient {})
           specs)))

(defn- same?
  "Two sides are the same when both are absent, or both present with equal path and content. Path equality
  matters so that a rename with otherwise identical content still counts as a change.

  Known conservative edge: the storage path embeds the names of containing collections, so renaming a
  shared parent collection on one side changes the path of every descendant. Those descendants therefore
  read as changed (path differs) even if their content is identical; if the other side also edited one of
  them, that surfaces as a conflict rather than auto-merging the rename with the edit. This is safe (never
  silently wrong) but more conservative than git would be. Revisit by comparing content separately from
  path if it proves noisy in practice."
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

(defn three-way-merge
  "Three-way merge of serialized content keyed on serdes identity.

  `base`, `ours`, `theirs` are each sequences of `{:path :content}` file specs (base/theirs typically read
  from the corresponding git trees, ours freshly serialized from the app DB).

  Returns a map:
  - `:merged`    - sequence of winning `{:path :content}` specs to write
  - `:conflicts` - sequence of `{:key :ours :theirs :base}` for entities changed differently on both sides
  - `:summary`   - `{:added :updated :removed}` counts of remote-originated changes folded into the result
                   (i.e. changes coming from `theirs` that `ours` did not already have)"
  [base ours theirs]
  (let [b (index-by-key base)
        o (index-by-key ours)
        t (index-by-key theirs)
        all-keys (into #{} (concat (keys b) (keys o) (keys t)))]
    (reduce
     (fn [acc k]
       (let [bv (get b k)
             ov (get o k)
             tv (get t k)
             ours-changed? (not (same? ov bv))
             theirs-changed? (not (same? tv bv))]
         (cond
           ;; neither side changed -> keep base (if present)
           (and (not ours-changed?) (not theirs-changed?))
           (cond-> acc bv (update :merged conj bv))

           ;; only ours changed -> take ours
           (and ours-changed? (not theirs-changed?))
           (cond-> acc ov (update :merged conj ov))

           ;; only theirs changed -> take theirs, and record it as folded-in remote change
           (and theirs-changed? (not ours-changed?))
           (-> (cond-> acc tv (update :merged conj tv))
               (update-in [:summary (cond (nil? bv) :added
                                          (nil? tv) :removed
                                          :else     :updated)]
                          inc))

           ;; both changed the same way -> take it (no conflict)
           (same? ov tv)
           (cond-> acc ov (update :merged conj ov))

           ;; both changed differently -> conflict
           :else
           (update acc :conflicts conj {:key k :base bv :ours ov :theirs tv}))))
     {:merged [] :conflicts [] :summary {:added 0 :updated 0 :removed 0}}
     all-keys)))

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
  (let [b (index-by-key base)
        o (index-by-key ours)]
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
     (index-by-key theirs))))

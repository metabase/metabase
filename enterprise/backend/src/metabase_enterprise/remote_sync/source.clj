(ns metabase-enterprise.remote-sync.source
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clojure.string :as str]
   [metabase-enterprise.remote-sync.merge :as remote-sync.merge]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.source.git :as git]
   [metabase-enterprise.remote-sync.source.ingestable :as ingestable]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.spec :as spec]
   [metabase-enterprise.serialization.core :as serialization]
   [metabase.models.serialization :as serdes]
   [metabase.settings.core :as setting]
   [metabase.util.log :as log]
   [metabase.util.yaml :as yaml]
   [methodical.core :as methodical]))

(set! *warn-on-reflection* true)

(defn paths->children
  "The immediate children of directory `path` implied by a flat collection of file `paths`. For snapshots
  that hold their whole file list in memory and so have no tree objects to walk; the git source overrides
  this with a real subtree read."
  [paths ^String path]
  ;; the root is the empty prefix — snapshot paths are repo-relative, so they never start with a slash
  (let [prefix (if (str/blank? path) "" (str path "/"))]
    (->> paths
         (keep (fn [^String p]
                 (when (str/starts-with? p prefix)
                   (let [child (subs p (count prefix))]
                     (str prefix (if-let [idx (str/index-of child "/")]
                                   (subs child 0 idx)
                                   child))))))
         distinct
         sort
         vec)))

;; A read-only, path-filtered view over a snapshot, used to scope ingestion to a set of path regexes:
;; files (and reads) outside the filters are omitted. It is not a write target — exports write to the
;; unfiltered source snapshot — so the write methods throw rather than silently filtering writes.
(defrecord WrappingSnapshot [original-snapshot path-filters]
  source.p/SourceSnapshot

  (list-files [_]
    (filter (fn [file-path]
              (some (fn [path-filter] (re-matches path-filter file-path)) path-filters))
            (source.p/list-files original-snapshot)))

  ;; Derived from this view's own (filtered) file list rather than delegated, so a child filtered out of
  ;; `list-files` can't reappear here.
  (list-dir [this path]
    (paths->children (source.p/list-files this) path))

  (read-file [_ path]
    (when (some (fn [path-filter] (re-matches path-filter path)) path-filters)
      (source.p/read-file original-snapshot path)))

  (open-commit [_]
    (throw (UnsupportedOperationException. "WrappingSnapshot is a read-only ingestion view, not a write target.")))

  (version [_]
    (source.p/version original-snapshot)))

(methodical/defmethod source.p/->ingestable :default
  [snapshot {:keys [path-filters root-dependencies]}]
  (cond->> (ingestable/->IngestableSnapshot (cond-> snapshot
                                              (seq path-filters) (->WrappingSnapshot path-filters))
                                            (atom nil) (atom []))
    (seq root-dependencies) (ingestable/wrap-root-dep-ingestable root-dependencies)))

(defn- resource-specs
  "The `{:path :content}` file specs of `entity`'s resource files, next to its YAML file at `path`."
  [path entity]
  (let [dir (subs path 0 (inc (or (str/last-index-of path "/") -1)))]
    (for [[resource content] (sort-by key (:serdes/resources entity))]
      {:path (str dir resource) :content content})))

(defn entity->file-spec-at
  "Serializes a single extracted entity at the YAML `path` into a `{:path :content :resources}` file spec;
  `:resources` holds the `{:path :content}` specs of its resource files."
  [path entity]
  {:path      path
   :content   (serialization/entity-yaml entity)
   :resources (vec (resource-specs path entity))})

(defn entity->file-spec
  "[[entity->file-spec-at]] the path storage context `opts` (from [[serdes/storage-base-context]]) gives `entity`."
  [opts entity]
  (entity->file-spec-at (serialization/entity-file-path opts entity) entity))

(defn file-specs
  "The `{:path :content}` specs of every file a `file-spec` from [[entity->file-spec]] writes."
  [file-spec]
  (cons (select-keys file-spec [:path :content]) (:resources file-spec)))

(defn content-hash
  "SHA-256 (hex) of a serialized YAML `content` string."
  [^String content]
  (codecs/bytes->hex (buddy-hash/sha256 content)))

(defn file-spec-hash
  "SHA-256 (hex) of the content of a `file-spec` from [[entity->file-spec]], including its resource files."
  [{:keys [content resources]}]
  (content-hash (apply str content (mapcat (juxt :path :content) resources))))

(defn row->file-info
  "The repo `:path` and the SHA-256 (hex) `:content-hash` of the serialized YAML for the entity named by `row`
  ({:model_type :model_id}), or nil if it can't be extracted."
  [row]
  (when-let [entity (first (spec/extract-entities-for-rows [row]))]
    (let [fspec (entity->file-spec (serdes/storage-base-context) entity)]
      {:path (:path fspec), :content-hash (file-spec-hash fspec)})))

(defn row->content-hash
  "SHA-256 (hex) of the serialized YAML for the entity named by `row` ({:model_type :model_id}), or nil if it
  can't be extracted. Hashes the live DB serialization (never on-disk bytes), so it's stable across sync points."
  [row]
  (:content-hash (row->file-info row)))

(defn serialize-specs
  "Serializes a stream of entities into an eager vector of `{:path :content}` file specs. Reports progress
  via `task-id` as specs are produced; pass nil for `task-id` to serialize without progress reporting
  (e.g. for a dry-run merge preview).

  `stream` is traversed exactly once. Progress needs a denominator: pass `:total` (see
  [[metabase-enterprise.remote-sync.spec/exportable-entity-count]]) to keep an uncounted stream such as the
  extraction eduction streaming; without it an uncounted stream is realized first.

  Throws Exception if any entity in the stream is an Exception instance."
  [stream task-id & {:keys [total]}]
  (let [opts   (serdes/storage-base-context)
        stream (if (or (nil? task-id) total (counted? stream)) stream (vec stream))
        total  (or total (when task-id (count stream)))
        report (if (and task-id (pos? total))
                 (fn [n]
                   (remote-sync.task/update-progress! task-id (-> n (/ total) (min 1) (* 0.65) (+ 0.3))))
                 (constantly nil))]
    (into []
          (comp (map-indexed (fn [idx entity]
                               (when (instance? Exception entity)
                                 (throw entity))
                               (let [spec (entity->file-spec opts entity)]
                                 (report (inc idx))
                                 (file-specs spec))))
                cat)
          stream)))

(defn- managed-path? [^String path]
  (when-let [idx (str/index-of path "/")]
    (contains? serialization/legal-top-level-paths (subs path 0 idx))))

(defn- shared-path? [^String path]
  (when-let [idx (str/index-of path "/")]
    (contains? serialization/shared-top-level-paths (subs path 0 idx))))

(defn- parent-dir [^String path]
  (when-let [idx (str/last-index-of path "/")]
    (subs path 0 idx)))

(defn- declared-resources
  "The paths of the resource files that the entity YAML files directly in directory `dir` of `snapshot` declare."
  [snapshot dir]
  (into #{}
        (comp (filter serialization/entity-file-path?)
              (mapcat (fn [path]
                        (try
                          (let [entity (yaml/parse-string (source.p/read-file snapshot path)
                                                          {:key-fn serialization/parse-key})]
                            (map #(str dir "/" %) (serdes/resource-paths entity)))
                          (catch Exception _
                            nil)))))
        (source.p/list-dir snapshot dir)))

(defn owned-paths
  "The managed paths among `paths` that serialization owns in `snapshot`: entity YAML files, and the resource files
  that a YAML file in one of their ancestor directories declares."
  [snapshot paths]
  (let [resources (memoize #(declared-resources snapshot %))]
    (filterv (fn [path]
               (and (managed-path? path)
                    (or (serialization/entity-file-path? path)
                        (some #(contains? (resources %) path)
                              (take-while some? (iterate parent-dir (parent-dir path)))))))
             paths)))

(defn replace-managed-files!
  "Stage the removal of every file serialization owns in `snapshot` into `commit`, so the files staged next replace
  them wholesale; files in [[serialization/shared-top-level-paths]] that serialization does not own are kept."
  [commit snapshot]
  (source.p/replace-all! commit)
  (run! #(source.p/stage-delete! commit %)
        (owned-paths snapshot (filter shared-path? (source.p/list-files snapshot)))))

(defn- snapshot->specs
  "Reads the files serialization owns in a snapshot into a sequence of `{:path :content}` specs, matching the
  shape produced by [[serialize-specs]]. Used to read the merge base and remote-tip trees for merging."
  [snapshot]
  (into []
        (keep (fn [path]
                (when-let [content (source.p/read-file snapshot path)]
                  {:path path :content content})))
        (owned-paths snapshot (source.p/list-files snapshot))))

(defn compute-merge
  "Runs the entity-identity 3-way merge of local state against the remote tip, without writing. Returns
  the raw merge result `{:merged :conflicts :summary}` from [[remote-sync.merge/three-way-merge]], plus
  `:force-push-casualties` (remote content a force push would discard; see
  [[remote-sync.merge/force-push-casualties]]), via [[remote-sync.merge/merge-with-casualties]]:
  - `base-snapshot` - the last successfully synced state (the merge base)
  - `stream`        - the local state to serialize (ours)
  - `snapshot`      - the current remote tip (theirs)

  `:merged` is the full reconciled set of `{:path :content}` specs. The export path writes it to the
  remote; the local-only pull merge loads it into the app DB via [[specs->snapshot]]. `:total` is passed
  through to [[serialize-specs]]."
  [stream snapshot base-snapshot task-id & {:keys [total]}]
  (let [ours   (serialize-specs stream task-id :total total)
        base   (snapshot->specs base-snapshot)
        theirs (snapshot->specs snapshot)]
    (remote-sync.merge/merge-with-casualties base ours theirs)))

(defn specs->snapshot
  "Builds an in-memory read-only SourceSnapshot backed by `specs` (a seq of `{:path :content}`), so merged
  content can be loaded into the app DB without writing it to git. Writing is unsupported."
  [specs]
  (let [by-path (into {} (map (juxt :path :content)) specs)]
    (reify source.p/SourceSnapshot
      (list-files [_] (vec (keys by-path)))
      (list-dir [_ path] (paths->children (keys by-path) path))
      (read-file [_ path] (get by-path path))
      (open-commit [_] (throw (ex-info "in-memory merge snapshot is read-only" {})))
      (version [_] nil))))

(defn preview-merge
  "Dry-run of the export merge: computes the 3-way merge without writing anything. Returns
  `{:clean? bool :conflicts [labels] :summary {:added :updated :removed}
    :force-push-casualties {:deleted [labels] :overwritten [labels]}}`. The casualties are the remote
  content a force push (rather than a merge) would discard. Pass nil for `task-id` to skip progress
  reporting."
  [stream snapshot base-snapshot task-id]
  (let [{:keys [conflicts summary force-push-casualties]}
        (compute-merge stream snapshot base-snapshot task-id)]
    {:clean?                 (empty? conflicts)
     :conflicts             (mapv remote-sync.merge/conflict-label conflicts)
     :summary               summary
     :force-push-casualties force-push-casualties}))

(defn force-push-casualties-no-base
  "Casualties of a force push when there is no merge base — the remote history was rewritten
  (force-pushed/rebased upstream), so the prior sync point is gone. Without a base we can't tell what
  changed since divergence, so every remote entity that isn't identical to what we'd write counts: remote
  content is foreign and gets discarded wholesale. Returns `{:deleted [labels] :overwritten [labels]}`
  (see [[remote-sync.merge/force-push-casualties]]). `stream` is the local state to serialize (ours),
  `snapshot` the rewritten remote tip (theirs)."
  [stream snapshot]
  (remote-sync.merge/force-push-casualties [] (serialize-specs stream nil) (snapshot->specs snapshot)))

(defn remote-from-settings
  "The [[source.p/Remote]] for the configured remote-sync-url and remote-sync-token, or nil when no URL is set. Makes no
  clone."
  []
  (when-let [url (setting/get :remote-sync-url)]
    (git/git-remote url (setting/get :remote-sync-token))))

(defn source-from-settings
  "Creates a git source from the current remote sync settings.

  Takes an optional branch name to use. If not provided, uses the configured remote-sync-branch setting.

  Returns a GitSource instance configured with the remote-sync-url, branch, and remote-sync-token from settings. The
  caller closes it with [[close!]]."
  ([branch]
   (git/git-source
    (setting/get :remote-sync-url)
    (or branch (setting/get :remote-sync-branch))
    (setting/get :remote-sync-token)
    serialization/replaced-top-level-paths))
  ([]
   (source-from-settings (setting/get :remote-sync-branch))))

(defn close!
  "Closes `source` when it is a `java.io.Closeable`, as a GitSource is. Does nothing for another source. Logs a failure
  of the close, and does not throw it."
  [source]
  ;; A close runs in a `finally`, so a throw would hide the result or the error of the operation.
  (when (instance? java.io.Closeable source)
    (try
      (.close ^java.io.Closeable source)
      (catch Throwable t
        (log/error t "Could not close a remote-sync source")))))

(defmacro with-source
  "Binds `sym` to the source that `expr` makes, runs `body`, and closes the source with [[close!]]."
  [[sym expr] & body]
  `(let [~sym ~expr]
     (try
       ~@body
       (finally
         (close! ~sym)))))

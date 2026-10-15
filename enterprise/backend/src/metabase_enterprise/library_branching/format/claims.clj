(ns metabase-enterprise.library-branching.format.claims
  "What the files of a tree hold, by their content alone: a path never decides what a file is. [[item-claims]] puts
  each file in one group:

  - item files: a YAML map whose `kind` is one of [[item-kinds]], with an `id`;
  - old-format item files: a YAML map with `serdes/meta`, as remote sync writes them;
  - format version files and manifests: a YAML map whose `format` names the format of `tree/format-version` or of
    `manifest/version`;
  - resource files: a file whose SHA-256 an item file names as `sha256:<hex>`;
  - foreign files: every other file, also a YAML file that does not parse. Sync never decodes a foreign file, and a
    push keeps it.

  [[decode]] also completes the system items that a tree lacks ([[with-system-items]])."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.manifest :as manifest]
   [metabase-enterprise.library-branching.format.tree :as tree])
  (:import
   (java.security MessageDigest)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------------ Claims -----------------------------------------------------

(def item-kinds
  "The closed set of kinds of the format version `tree/format-version`. A kind can be in it before it has a codec: a
  file of such a kind is an item file that does not decode."
  #{:action :collection :dashboard :data-app :document :glossary-term :measure :metric :model :published-table
    :python-library :question :segment :snippet :timeline :transform :transform-job :transform-tag :transform-test})

(defn- names-format?
  "True iff `v` is a string that names the format of the version `version`: it starts with the part of `version` up
  to its last /."
  [version v]
  (and (string? v)
       (str/starts-with? v (subs version 0 (inc (str/last-index-of version "/"))))))

(defn claim
  "What document `doc` claims to be: `:item`, `:old-item`, `:format` (a format version file), `:manifest`, or nil."
  [doc]
  (when (map? doc)
    (let [{:keys [kind] fmt :format} doc]
      (cond
        (and (string? kind) (contains? item-kinds (keyword kind)) (contains? doc :id)) :item
        (contains? doc :serdes/meta)                                                    :old-item
        (names-format? tree/format-version fmt)                                         :format
        (names-format? manifest/version fmt)                                            :manifest))))

(defn- read-doc
  "The document of the bytes `b`, or nil when `b` is not one YAML document of the document model."
  [^bytes b]
  (try
    (codec/read-yaml b)
    (catch clojure.lang.ExceptionInfo e
      (when-not (= ::codec/unreadable (:type (ex-data e)))
        (throw e)))))

(defn- named-hashes
  "The SHA-256 digests, as 64 lower-case hex digits, that document `doc` names as `sha256:<hex>` at any depth."
  [doc]
  (cond
    (map? doc)    (into #{} (mapcat named-hashes) (vals doc))
    (vector? doc) (into #{} (mapcat named-hashes) doc)
    (string? doc) (if-let [[_ h] (re-matches #"sha256:([0-9a-f]{64})" doc)] #{h} #{})
    :else         #{}))

(defn- sha-256-hex
  ^String [^bytes b]
  (format "%064x" (BigInteger. 1 (.digest (MessageDigest/getInstance "SHA-256") b))))

(def ^:private group-key
  {:item :items :old-item :old-items :format :formats :manifest :manifests})

(defn item-claims
  "The files `files` (`{path bytes}`) of a tree, split by their content into groups, each `{path bytes}`:

    {:items     item files
     :old-items old-format item files
     :formats   format version files
     :manifests manifests
     :resources resource files
     :foreign   foreign files}

  Each file is in exactly one group, with its bytes. The group of a file is a function of its bytes, and for a
  resource file of the bytes of the item files; never of a path."
  [files]
  (let [read     (into {} (map (fn [[p b]] (let [doc (read-doc b)] [p {:claim (claim doc) :doc doc}]))) files)
        groups   (group-by #(group-key (:claim (read (key %))) :rest) files)
        hashes   (into #{} (mapcat #(named-hashes (:doc (read (key %))))) (:items groups))
        resource? (fn [[_ b]] (and (seq hashes) (contains? hashes (sha-256-hex b))))]
    {:items     (into {} (:items groups))
     :old-items (into {} (:old-items groups))
     :formats   (into {} (:formats groups))
     :manifests (into {} (:manifests groups))
     :resources (into {} (filter resource?) (:rest groups))
     :foreign   (into {} (remove resource?) (:rest groups))}))

(defn claimed-files
  "The item files and the format version files of `claims` (of [[item-claims]]): what `tree/decode-tree` reads."
  [claims]
  (merge (:items claims) (:formats claims)))

(defn kept-files
  "The files of `claims` that sync does not write, so a push keeps each at its path: the foreign files, the manifests
  and the resource files."
  [claims]
  (merge (:foreign claims) (:manifests claims) (:resources claims)))

(defn old-format?
  "True iff `claims` hold an old-format item file and no format version file: a tree that remote sync wrote."
  [claims]
  (boolean (and (empty? (:formats claims)) (seq (:old-items claims)))))

;;; ------------------------------------------------------ Lints ------------------------------------------------------

(def area-directories
  "The top-level directories of the layout: the Library and the areas of the namespaces."
  #{"actions" "apps" "glossary" "library" "snippets" "transforms"})

(defn- top-directory
  "The first segment of path `p` when `p` has two or more segments, else nil."
  [^String p]
  (when-let [i (str/index-of p "/")]
    (subs p 0 i)))

(defn foreign-lints
  "`{:rule :foreign-file :path p}` for each foreign file of `claims` whose path ends in .yaml or .yml and is inside one
  of [[area-directories]]: a file that a person can take for an item file, which sync ignores. In the order of the
  paths."
  [claims]
  (vec (for [p     (sort (keys (:foreign claims)))
             :when (and (re-find #"\.ya?ml$" p)
                        (contains? area-directories (top-directory p)))]
         {:rule :foreign-file :path p})))

;;; -------------------------------------------------- System items ---------------------------------------------------

(def ^:private library-id "librarylibrarylibrary")

(def system-items
  "`{identity item}`: the system items that a tree holds when no file holds them, each at the content that the release
  creates: the three sections of the Library."
  ;; The Library itself is not here. An instance has the Library only after a person creates it (the sections come
  ;; with it), so a tree with no Library is not one that lacks it.
  (into {}
        (map (fn [[id item-name type]]
               [id {:kind :collection :name item-name :place library-id :refs #{} :attrs {:type type}}]))
        [["librarylibrarydatadat" "Data" "library-data"]
         ["librarylibrarymetrics" "Metrics" "library-metrics"]
         ["librarylibrarydashbrd" "Dashboards" "library-dashboards"]]))

(defn with-system-items
  "Snapshot `s` with each item of [[system-items]] that it lacks and whose place it holds (or that is at the root
  level), at its release content. An item of `s` keeps its content."
  [s]
  (loop [s s]
    (let [m (filter (fn [[id {:keys [place]}]]
                      (and (not (contains? s id))
                           (or (nil? place) (contains? s place))))
                    system-items)]
      (if (seq m)
        (recur (into s m))
        s))))

(defn decode
  "The snapshot that the tree `files` (`{path bytes}`) holds, with the codecs `codecs`: `tree/decode-tree` of its
  [[claimed-files]] in the order of their paths, then [[with-system-items]]. `{:snapshot s}`, or `{:findings [f ...]}`
  of `tree/decode-tree`."
  [codecs files]
  (let [r (tree/decode-tree codecs (vals (into (sorted-map) (claimed-files (item-claims files)))))]
    (cond-> r
      (:snapshot r) (update :snapshot with-system-items))))

(ns metabase-enterprise.library-branching.format.tree
  "A snapshot as the files of a git tree, and back. Decode reads the contents of the files only, never their paths:
  the same files at any paths, a flat list included, decode to the same snapshot."
  (:require
   [clojure.string :as str]
   [malli.error :as me]
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.layout :as layout]
   [metabase-enterprise.library-branching.snapshot :as snapshot]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(def format-path
  "The path of the format version file."
  ".metabase/format.yaml")

(def format-version
  "The format version that this code writes and reads."
  "library-branching/1")

(defn- encode-file
  ^bytes [c id item]
  (let [doc (codec/encode c id item)]
    (when-not (= (name (codec/kind c)) (:kind doc))
      (throw (ex-info (str "The codec of the kind " (codec/kind c) " gave a document of another kind.")
                      {:kind (codec/kind c) :doc-kind (:kind doc)})))
    (codec/write-yaml doc)))

(defn encode-tree
  "`{path bytes}` of snapshot `s`, with the codecs `codecs`: each item at the path that `layout/layout` gives, and the
  format version file at [[format-path]]. Equal snapshots give equal trees. Throws when a kind of `s` has no codec,
  or when `s` has a place outside it or a containment cycle."
  [codecs s]
  (let [by-kind (codec/by-kind codecs)
        paths   (layout/layout codecs s)]
    (into {format-path (codec/write-yaml {:format format-version})}
          (map (fn [[id item]] [(get paths id) (encode-file (get by-kind (:kind item)) id item)]))
          s)))

(defn- finding
  [type reason & {:as more}]
  (merge {:type type :reason reason} more))

(defn decode-file
  "What the bytes `b` of one file hold: `{:item [id item]}`, `{:format doc}` for a format version file, or
  `{:finding f}`. `by-name` maps the name of each kind to its codec."
  [by-name ^bytes b]
  (try
    (let [doc (codec/read-yaml b)]
      (cond
        (not (map? doc))
        {:finding (finding :unreadable "The file is not a YAML map.")}

        (contains? doc :kind)
        (let [k (:kind doc)]
          (if-let [c (when (string? k) (get by-name k))]
            (let [[id item] (codec/decode c doc)]
              (cond
                (not (mr/validate ::snapshot/identity id))
                {:finding (finding :invalid (str "The identity is not an entity id or a table key: " (pr-str id)))}

                (not (mr/validate (codec/schema c) item))
                {:finding (finding :invalid (str "The item does not fit the schema of its kind: "
                                                 (pr-str (me/humanize (mr/explain (codec/schema c) item)))))}

                :else
                {:item [id item]}))
            {:finding (finding :unknown-kind (str "No codec for the kind " (pr-str k)) :kind (if (string? k) (keyword k) k))}))

        (contains? doc :format)
        {:format doc}

        :else
        {:finding (finding :unreadable "The file has neither a kind nor a format version.")}))
    (catch clojure.lang.ExceptionInfo e
      (case (:type (ex-data e))
        ::codec/unreadable {:finding (finding :unreadable (ex-message e))}
        ::codec/invalid    {:finding (finding :invalid (ex-message e))}
        (throw e)))))

(defn duplicate-findings
  "A `:duplicate-identity` finding for each identity that two or more of the decoded files `items` hold. Each element
  of `items` is `{:item [id item] :file n}`."
  [items]
  (->> (group-by (comp first :item) items)
       (keep (fn [[id files]]
               (let [files (mapv :file files)]
                 (when (< 1 (count files))
                   (finding :duplicate-identity "Two or more files hold one identity." :id id :files files)))))
       (sort-by (comp first :files))))

(defn format-findings
  "The findings of the format version files `formats`, each `{:format doc :file n}`: none, two or more, or one with
  a version that is not [[format-version]]."
  [formats]
  (let [docs (map :format formats)]
    (cond
      (empty? docs)
      [(finding :no-format (str "The tree has no format version file (" format-path ")."))]

      (< 1 (count docs))
      [(finding :duplicate-format "The tree has two or more format version files." :files (mapv :file formats))]

      :else
      (let [doc (first docs)]
        (when-not (= format-version (:format doc))
          [(finding :unknown-format (str "The format version is not " format-version ".")
                    :format (:format doc) :file (:file (first formats)))])))))

(defn decode-tree
  "The snapshot that the file contents `files` (a collection of byte arrays, with no paths) hold, with the codecs
  `codecs`: `{:snapshot s}`, or `{:findings [f ...]}` when a file does not decode. Each finding has `:type` and
  `:reason`; a finding of one file has `:file`, its position in `files`. The types: `:unreadable` (not one YAML map
  of the document model, with a kind or a format version), `:unknown-kind` (with `:kind`), `:invalid` (the codec
  refuses the document, or the item does not fit its schema), `:duplicate-identity` (with `:id` and `:files`),
  `:no-format`, `:duplicate-format` (with `:files`) and `:unknown-format` (with `:format`). The order of `files`
  changes no snapshot."
  [codecs files]
  (let [by-name  (update-keys (codec/by-kind codecs) name)
        results  (map-indexed (fn [i b] (assoc (decode-file by-name b) :file i)) files)
        items    (filter :item results)
        findings (concat (keep (fn [{f :finding i :file}] (some-> f (assoc :file i))) results)
                         (duplicate-findings items)
                         (format-findings (filter :format results)))]
    (if (seq findings)
      {:findings (vec findings)}
      {:snapshot (into {} (map :item) items)})))

(defn old-format?
  "True iff the tree paths `paths` hold no [[format-path]] and some YAML file outside a directory whose name starts
  with a dot: a repository that remote sync wrote."
  [paths]
  (boolean
   (and (not-any? #{format-path} paths)
        (some (fn [p] (and (str/ends-with? p ".yaml")
                           (not-any? #(str/starts-with? % ".") (str/split p #"/"))))
              paths))))

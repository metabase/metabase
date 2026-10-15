(ns metabase-enterprise.library-branching.format.tree
  "The files of a git tree as a snapshot. Decode reads the contents of the files only, never their paths: the same
  files at any paths, a flat list included, decode to the same snapshot. `writer/encode-tree` is the inverse."
  (:require
   [malli.error :as me]
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.registry :as registry]
   [metabase-enterprise.library-branching.snapshot :as snapshot]))

(set! *warn-on-reflection* true)

(def format-path
  "The path of the format version file."
  ".metabase/format.yaml")

(def format-version
  "The format version that this code writes and reads."
  "library-branching/1")

(defn- finding
  [type reason & {:as more}]
  (merge {:type type :reason reason} more))

(defn decode-item
  "What the document `doc`, a map with a `:kind`, holds: `{:item [id item]}`, or `{:finding f}` when no codec has its
  kind (`:unknown-kind`, with `:kind`) or when its codec refuses it (`:invalid`). `by-name` maps the name of each kind
  to its codec."
  [by-name doc]
  (let [k (:kind doc)]
    (if-let [c (when (string? k) (get by-name k))]
      (try
        (let [[id item] (codec/decode c doc)]
          (cond
            (not (registry/validate ::snapshot/identity id))
            {:finding (finding :invalid (str "The identity is not an entity id or a table key: " (pr-str id)))}

            (not (registry/validate (codec/schema c) item))
            {:finding (finding :invalid (str "The item does not fit the schema of its kind: "
                                             (pr-str (me/humanize (registry/explain (codec/schema c) item)))))}

            :else
            {:item [id item]}))
        (catch clojure.lang.ExceptionInfo e
          (if (= ::codec/invalid (:type (ex-data e)))
            {:finding (finding :invalid (ex-message e))}
            (throw e))))
      {:finding (finding :unknown-kind (str "No codec for the kind " (pr-str k)) :kind (if (string? k) (keyword k) k))})))

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
        (decode-item by-name doc)

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

(defn decode-files
  "[[decode-tree]], with the file of each item: `{:snapshot s :files {id n}}`, where `n` is the position in `files` of
  the file of item `id`, or `{:findings [f ...]}`."
  [codecs files]
  (let [by-name  (update-keys (codec/by-kind codecs) name)
        results  (map-indexed (fn [i b] (assoc (decode-file by-name b) :file i)) files)
        items    (filter :item results)
        findings (concat (keep (fn [{f :finding i :file}] (some-> f (assoc :file i))) results)
                         (duplicate-findings items)
                         (format-findings (filter :format results)))]
    (if (seq findings)
      {:findings (vec findings)}
      {:snapshot (into {} (map :item) items)
       :files    (into {} (map (fn [{[id] :item i :file}] [id i])) items)})))

(defn decode-tree
  "The snapshot that the file contents `files` (a collection of byte arrays, with no paths) hold, with the codecs
  `codecs`: `{:snapshot s}`, or `{:findings [f ...]}` when a file does not decode. Each finding has `:type` and
  `:reason`; a finding of one file has `:file`, its position in `files`. The types: `:unreadable` (not one YAML map
  of the document model, with a kind or a format version), `:unknown-kind` (with `:kind`), `:invalid` (the codec
  refuses the document, or the item does not fit its schema), `:duplicate-identity` (with `:id` and `:files`),
  `:no-format`, `:duplicate-format` (with `:files`) and `:unknown-format` (with `:format`). The order of `files`
  changes no snapshot."
  [codecs files]
  (dissoc (decode-files codecs files) :files))

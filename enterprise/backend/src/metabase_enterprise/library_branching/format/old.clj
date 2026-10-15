(ns metabase-enterprise.library-branching.format.old
  "The old format: the serdes files that remote sync writes. [[decode-tree]] decodes them to a snapshot of the new
  format; it reads no app DB and no path. Each file names its serdes model in `serdes/meta`. [[decoders]] has one
  function per model, which turns a document of the model into a document of the new format (that the codec of its
  kind decodes) or into parts of an item; [[assemblers]] has one function per kind whose item is several files."
  (:require
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.old.card :as old.card]
   [metabase-enterprise.library-branching.format.old.collection :as old.collection]
   [metabase-enterprise.library-branching.format.old.common :as common]
   [metabase-enterprise.library-branching.format.old.glossary :as old.glossary]
   [metabase-enterprise.library-branching.format.old.published-table :as old.published-table]
   [metabase-enterprise.library-branching.format.old.snippet :as old.snippet]
   [metabase-enterprise.library-branching.format.old.table-item :as old.table-item]
   [metabase-enterprise.library-branching.format.tree :as tree]))

(set! *warn-on-reflection* true)

(def decoders
  "`{model f}`: the decoder of each serdes model of the old format. `(f doc opts)` takes a document of the model and
  the options of [[decode-tree]], and returns one of:

  - `{:doc d}`: `d` is the document of an item in the new format, which the codec of its kind decodes;
  - `{:parts [p ...]}`: parts of items, which [[assemblers]] build; each part has `:of`, `[kind identity]`;
  - `{:skip :archived :id i}`: item `i` is in the trash, so neither it nor an item under it is in the snapshot;
  - `{:skip reason}`: the document holds no content of the new format.

  It throws `codec/invalid!` for a document that it refuses."
  {"Card"               #'old.card/decode
   "Collection"         #'old.collection/decode
   "Dimension"          #'old.published-table/decode-dimension
   "Field"              #'old.published-table/decode-field
   "FieldUserSettings"  #'old.published-table/decode-field-settings
   "Glossary"           #'old.glossary/decode
   "Measure"            #'old.table-item/decode-measure
   "NativeQuerySnippet" #'old.snippet/decode
   "Segment"            #'old.table-item/decode-segment
   "Table"              #'old.published-table/decode-table
   "TableUserSettings"  #'old.published-table/decode-table-settings})

(def assemblers
  "`{kind f}`: the builder of each kind whose item is several parts. `(f id parts opts)` takes the identity, the parts
  of the item (each with `:file`, the position of its file) and the options of [[decode-tree]], and returns `{:doc d
  :file n}` (a document as of a decoder, attributed to file `n`), `{:skip reason}`, or `{:findings [f ...]}`."
  {:published-table #'old.published-table/assemble})

(defn- finding
  [type reason & {:as more}]
  (merge {:type type :reason reason} more))

(defn- decode-file
  "What the bytes `b` of one file hold: a result of a decoder of [[decoders]], or `{:finding f}`."
  [opts ^bytes b]
  (try
    (let [doc   (codec/read-yaml b)
          model (common/model doc)]
      (cond
        (not (map? doc))      {:finding (finding :unreadable "The file is not a YAML map.")}
        (not (string? model)) {:finding (finding :invalid "The serdes/meta of the file names no model.")}
        :else                 (if-let [f (get decoders model)]
                                (f doc opts)
                                {:finding (finding :unknown-kind (str "No old-format decoder for the model " model)
                                                   :model model)})))
    (catch clojure.lang.ExceptionInfo e
      (case (:type (ex-data e))
        ::codec/unreadable {:finding (finding :unreadable (ex-message e))}
        ::codec/invalid    {:finding (finding :invalid (ex-message e))}
        (throw e)))))

(defn- assemble
  "The results of the [[assemblers]] for the parts of `results`, one per item, in the order of the items."
  [opts results]
  (let [parts (mapcat (fn [{:keys [parts file]}] (map #(assoc % :file file) parts)) results)]
    (for [[[kind id] ps] (sort-by (comp pr-str key) (group-by :of parts))]
      ((get assemblers kind) id ps opts))))

(defn- without-trash
  "Snapshot `s` without the items of the identities `trashed` and every item under one of them."
  [s trashed]
  (loop [s (apply dissoc s trashed), gone (set trashed)]
    (let [under (keep (fn [[id {:keys [place]}]] (when (contains? gone place) id)) s)]
      (if (seq under)
        (recur (apply dissoc s under) (into gone under))
        s))))

(defn decode-tree
  "The snapshot that the old-format files `files` (a collection of byte arrays, with no paths) hold, with the codecs
  `codecs`: `{:snapshot s}`, or `{:findings [f ...]}` when a file does not decode. The findings are those of
  `tree/decode-tree`, and `:unknown-kind` with `:model` for a file of a serdes model with no decoder. The order of
  `files` changes no snapshot. `opts`: `:table-names`, `{table-key name}`, the display name that warehouse sync gives
  each table, for the name of a published table whose settings have none."
  ([codecs files]
   (decode-tree codecs files {}))
  ([codecs files opts]
   (let [by-name  (update-keys (codec/by-kind codecs) name)
         results  (vec (map-indexed (fn [i b] (assoc (decode-file opts b) :file i)) files))
         built    (assemble opts results)
         decoded  (map (fn [{:keys [doc file]}] (assoc (tree/decode-item by-name doc) :file file))
                       (concat (filter :doc results) (filter :doc built)))
         items    (filter :item decoded)
         findings (concat (keep (fn [{f :finding i :file}] (some-> f (assoc :file i)))
                                (sort-by :file (concat results decoded)))
                          (mapcat :findings built)
                          (tree/duplicate-findings items))]
     (if (seq findings)
       {:findings (vec findings)}
       {:snapshot (without-trash (into {} (map :item) items)
                                 (keep (fn [{:keys [skip id]}] (when (= :archived skip) id)) results))}))))

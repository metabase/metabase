(ns metabase-enterprise.library-branching.instance.content
  "Helpers that the kinds share to build the content of an item from app DB rows."
  (:require
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.kinds :as format.kinds]
   [metabase-enterprise.library-branching.format.kinds.common :as format.common]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.registry :as registry]))

(set! *warn-on-reflection* true)

(def chunk-size
  "The most identities in one query of a kind."
  1000)

(defn in-chunks
  "The concatenation of `(f chunk)` over the chunks of `ids`, in the order of `ids`, at most `n` (default
  [[chunk-size]]) in one chunk."
  ([f ids] (in-chunks f ids chunk-size))
  ([f ids n] (into [] (mapcat f) (partition-all n ids))))

(defn attrs
  "The attributes `m` (a document map) of an item of the kind of format spec `spec`, without each attribute that is
  nil or at its default: an absent attribute is at its default."
  [spec m]
  (format.common/drop-defaults spec (into {} (remove (comp nil? val)) m)))

(defn item
  "The item of `kind` with identity `id`, named `item-name`, at `place`, with attributes `attrs` and the references
  that the format gives for them."
  [kind id item-name place attrs]
  {:kind  kind
   :name  item-name
   :place place
   :refs  (format.kinds/refs kind id attrs)
   :attrs attrs})

(def ^:private codecs
  (codec/by-kind format.kinds/codecs))

(defn check-item!
  "Throws ::instance/refused unless `item` is an item of `kind` by the schema of its codec, whose identity is `id`."
  [kind id item]
  (let [schema (codec/schema (get codecs kind))]
    (when-not (and (= kind (:kind item)) (registry/validate schema item))
      (instance/refuse! :invalid-content id (str "The content is not an item of the kind " (name kind) ".")
                        {:explanation (registry/explain schema item)}))))

(defn attr-value
  "The value of attribute `k` of format spec `spec` in `attrs`: its value, or its default when absent."
  [spec attrs k]
  (get attrs k (get-in spec [:attrs k :default])))

(defn changed-attrs
  "The attributes of format spec `spec` whose value in the attributes `new` differs from the value in `old`, an absent
  attribute at its default. `old` nil is an item with no attribute set."
  [spec old new]
  (into #{}
        (filter #(not= (attr-value spec old %) (attr-value spec new %)))
        (keys (:attrs spec))))

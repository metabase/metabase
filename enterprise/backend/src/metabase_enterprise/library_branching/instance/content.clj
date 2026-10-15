(ns metabase-enterprise.library-branching.instance.content
  "Helpers that the kinds share to build the content of an item from app DB rows, and to write it."
  (:require
   [metabase-enterprise.library-branching.db :as library-branching.db]
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

(defn current-state
  "The value of `instance/current` for an item whose row is in the Library tree iff `in-tree?` (false also when there is
  no row): `{:state :absent}` when it is not; else `{:state :live :content (read)}` when `(in-scope?)`, and
  `{:state :trashed :content (read)}` when not."
  [in-tree? in-scope? read]
  (cond
    (not in-tree?) {:state :absent}
    (in-scope?)    {:state :live :content (read)}
    :else          {:state :trashed :content (read)}))

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

(defn do-in-write-transaction
  "Calls `f` with no arguments in a transaction (a savepoint inside an open one) for a write or a trash of item `id`,
  and returns its result. A throw of `f` rolls the transaction back. When the save path of the app DB model refuses
  the change with status code 400 (the Library's content rule does), this throws ::instance/refused with reason
  `:content-rule` and the message of the save path."
  [id f]
  (try
    (library-branching.db/do-in-transaction f)
    (catch clojure.lang.ExceptionInfo e
      (let [{:keys [status-code type]} (ex-data e)]
        (if (and (= 400 status-code) (not= ::instance/refused type))
          (instance/refuse! :content-rule id (ex-message e))
          (throw e))))))

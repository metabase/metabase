(ns metabase-enterprise.library-branching.instance.content
  "Helpers that the kinds share to build the content of an item from app DB rows."
  (:require
   [metabase-enterprise.library-branching.format.kinds :as format.kinds]
   [metabase-enterprise.library-branching.format.kinds.common :as format.common]))

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

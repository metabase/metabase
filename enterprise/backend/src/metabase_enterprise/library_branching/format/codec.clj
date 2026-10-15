(ns metabase-enterprise.library-branching.format.codec
  "The `Codec` protocol, and the canonical YAML form of a document.")

(set! *warn-on-reflection* true)

(defprotocol Codec
  "The file form of one kind, as a document. Pure."
  (kind [codec]
    "The kind keyword of the items of this codec.")
  (encode [codec id item]
    "The document of item `item` with identity `id`.")
  (decode [codec doc]
    "`[id item]` of document `doc`.")
  (schema [codec]
    "The schema of the items of this kind."))

(defn invalid!
  "Not implemented."
  [_reason]
  nil)

(defn by-kind
  "Not implemented."
  [_codecs]
  nil)

(defn write-yaml
  "Not implemented."
  [_doc]
  nil)

(defn read-yaml
  "Not implemented."
  [_bytes]
  nil)

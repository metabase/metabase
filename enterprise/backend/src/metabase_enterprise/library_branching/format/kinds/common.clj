(ns metabase-enterprise.library-branching.format.kinds.common
  "A codec of one kind, built from data. Not implemented yet."
  (:require
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.layout :as layout]))

(set! *warn-on-reflection* true)

(defn document?
  "Not implemented yet."
  [_x]
  false)

(defn drop-defaults
  "Not implemented yet."
  [_spec attrs]
  attrs)

(defn refs-consistent?
  "Not implemented yet."
  [_spec _item]
  true)

(defn encode-item
  "Not implemented yet."
  [_spec _id _item]
  {})

(defn decode-doc
  "Not implemented yet."
  [_spec _doc]
  (codec/invalid! "not implemented"))

(defn codec
  "Not implemented yet."
  [{:keys [kind word directory?] :as spec}]
  (reify
    codec/Codec
    (kind [_] kind)
    (encode [_ id item] (encode-item spec id item))
    (decode [_ doc] (decode-doc spec doc))
    (schema [_] :any)

    layout/Layout
    (word [_] word)
    (directory? [_] directory?)
    (home [_ _item] {:dir ["library"]})))

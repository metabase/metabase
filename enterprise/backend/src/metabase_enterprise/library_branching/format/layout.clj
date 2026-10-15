(ns metabase-enterprise.library-branching.format.layout
  "The layout: the path of each item of a snapshot.")

(set! *warn-on-reflection* true)

(defprotocol Layout
  "The layout data of one kind."
  (word [codec]
    "The kind word in file names.")
  (directory? [codec]
    "True iff an item of this kind is a directory.")
  (home [codec item]
    "Where a root-level item sits."))

(defn slug
  "Not implemented."
  [_name]
  nil)

(defn identity-segment
  "Not implemented."
  [_id]
  nil)

(defn layout
  "Not implemented."
  [_codecs _snapshot]
  nil)

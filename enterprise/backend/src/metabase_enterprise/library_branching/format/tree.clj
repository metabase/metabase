(ns metabase-enterprise.library-branching.format.tree
  "A git tree and a snapshot.")

(set! *warn-on-reflection* true)

(def format-path
  "The path of the format version file."
  ".metabase/format.yaml")

(def format-version
  "The format version."
  "library-branching/1")

(defn encode-tree
  "Not implemented."
  [_codecs _snapshot]
  nil)

(defn decode-tree
  "Not implemented."
  [_codecs _files]
  nil)

(defn old-format?
  "Not implemented."
  [_paths]
  nil)

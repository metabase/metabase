(ns metabase-enterprise.library-branching.format.old
  "The old format: the serdes files that remote sync writes, decoded to a snapshot.")

(set! *warn-on-reflection* true)

(defn decode-tree
  "Not implemented yet: the empty snapshot."
  ([codecs files] (decode-tree codecs files {}))
  ([_codecs _files _opts] {:snapshot {}}))

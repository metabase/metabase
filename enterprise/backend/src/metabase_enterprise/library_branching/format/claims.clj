(ns metabase-enterprise.library-branching.format.claims
  "What the files of a tree hold. Not built yet: this version keeps the rule by path of `tree/managed-path?`."
  (:require
   [metabase-enterprise.library-branching.format.tree :as tree]))

(set! *warn-on-reflection* true)

(def item-kinds
  "The closed set of kinds of the format version."
  #{})

(defn claim
  "What document `doc` claims to be. Not built yet."
  [_doc]
  nil)

(defn item-claims
  "The files `files` (`{path bytes}`) of a tree split by path. Not built yet."
  [files]
  (let [managed (into {} (filter (comp tree/managed-path? key)) files)]
    {:items     (dissoc managed tree/format-path)
     :old-items {}
     :formats   (select-keys managed [tree/format-path])
     :manifests {}
     :resources {}
     :foreign   (into {} (remove (comp tree/managed-path? key)) files)}))

(defn claimed-files
  "The item files and the format version files of `claims`."
  [claims]
  (merge (:items claims) (:formats claims)))

(defn kept-files
  "The files of `claims` that a push keeps at their paths."
  [claims]
  (merge (:foreign claims) (:manifests claims) (:resources claims)))

(defn old-format?
  "True iff `claims` are of a tree in the old format. Not built yet."
  [claims]
  (tree/old-format? (keys (merge (:items claims) (:formats claims) (:foreign claims)))))

(def area-directories
  "The top-level directories of the layout. Not built yet."
  #{})

(defn foreign-lints
  "The lints of the foreign files of `claims`. Not built yet."
  [_claims]
  [])

(def system-items
  "The system items. Not built yet."
  {})

(defn with-system-items
  "Snapshot `s` completed with the system items. Not built yet."
  [s]
  s)

(defn decode
  "The snapshot that the tree `files` holds, with the codecs `codecs`."
  [codecs files]
  (let [r (tree/decode-tree codecs (vals (into (sorted-map) (claimed-files (item-claims files)))))]
    (cond-> r (:snapshot r) (update :snapshot with-system-items))))

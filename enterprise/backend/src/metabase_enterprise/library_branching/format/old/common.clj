(ns metabase-enterprise.library-branching.format.old.common
  "Helpers of the decoders of the old format: the serdes model of a document, and the attributes that a document
  holds.")

(set! *warn-on-reflection* true)

(defn model
  "The serdes model that document `doc` names: the `:model` of the last entry of its `serdes/meta`, or nil."
  [doc]
  (let [m (:serdes/meta doc)]
    (when (and (vector? m) (map? (peek m)))
      (:model (peek m)))))

(defn archived?
  "True iff document `doc` is of an item in the trash."
  [doc]
  (true? (:archived doc)))

(defn present
  "Map `m` without each key whose value is nil: the old format writes an unset column as nil, and the new format
  omits an attribute at its default."
  [m]
  (into {} (remove (comp nil? val)) m))

(defn item-doc
  "The document of the new format of the item of `kind` (a keyword) with identity `id`, with the entries of `m`, an
  entry with a nil value omitted."
  [kind id m]
  (merge (present m) {:kind (name kind) :id id}))

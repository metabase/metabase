(ns metabase-enterprise.library-branching.instance.portable
  "Portable forms of app DB values, made by the serdes export of master.")

(set! *warn-on-reflection* true)

(defn export-batch
  "`(mapv f xs)`."
  [f xs]
  (mapv f xs))

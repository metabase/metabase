(ns metabase-enterprise.library-branching.format.kinds.published-table
  "The codec of the kind :published-table. Not implemented yet."
  (:require
   [metabase-enterprise.library-branching.format.kinds.common :as common]))

(set! *warn-on-reflection* true)

(def spec "Not implemented yet." {:kind :published-table :word "table" :directory? false :attrs {}})

(defn field-refs "Not implemented yet." [_path _fields] #{})
(defn refs "Not implemented yet." [_id _attrs] #{})

(def codec "Not implemented yet." (common/codec spec))

(ns metabase-enterprise.library-branching.format.kinds
  "The codecs of the kinds of the snapshot. Not implemented yet."
  (:require
   [metabase-enterprise.library-branching.format.kinds.collection :as collection]
   [metabase-enterprise.library-branching.format.kinds.metric :as metric]
   [metabase-enterprise.library-branching.format.kinds.published-table :as published-table]
   [metabase-enterprise.library-branching.format.kinds.snippet :as snippet]))

(set! *warn-on-reflection* true)

(def codecs
  "One codec for each kind."
  [collection/codec metric/codec published-table/codec snippet/codec])

(defn refs
  "Not implemented yet."
  [_kind _id _attrs]
  #{})

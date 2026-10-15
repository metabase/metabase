(ns metabase-enterprise.library-branching.format.kinds
  "The codecs of the kinds of the snapshot, and the references of an item of each kind."
  (:require
   [metabase-enterprise.library-branching.format.kinds.collection :as collection]
   [metabase-enterprise.library-branching.format.kinds.common :as common]
   [metabase-enterprise.library-branching.format.kinds.glossary :as glossary]
   [metabase-enterprise.library-branching.format.kinds.metric :as metric]
   [metabase-enterprise.library-branching.format.kinds.published-table :as published-table]
   [metabase-enterprise.library-branching.format.kinds.snippet :as snippet]))

(set! *warn-on-reflection* true)

(def ^:private specs
  {:collection      collection/spec
   :glossary-term   glossary/spec
   :metric          metric/spec
   :published-table published-table/spec
   :snippet         snippet/spec})

(def codecs
  "One codec for each kind of `snapshot/kinds`, for `writer/encode-tree`, `tree/decode-tree` and `layout/layout`."
  [collection/codec glossary/codec metric/codec published-table/codec snippet/codec])

(defn refs
  "The `:refs` of the item of kind `kind` with identity `id` and attributes `attrs`. Throws for an unknown kind."
  [kind id attrs]
  (common/refs-of (or (get specs kind) (throw (ex-info (str "No codec for the kind " kind) {:kind kind})))
                  id
                  attrs))

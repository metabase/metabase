(ns metabase.staleness.core
  "Central staleness contract. Each stale-eligible model gives a [[spec]] in the model's own namespace.
  Consumers (the EE stale module's `find-candidates`) ask the spec of each model they cover.

  Kept dependency-light (no model requires) so model namespaces can require it without creating a
  load cycle."
  (:require
   [metabase.staleness.spec]
   [metabase.util.malli.registry :as mr]
   [potemkin :as p]))

(comment metabase.staleness.spec/keep-me)

(p/import-vars
 [metabase.staleness.spec
  candidates-fn
  load-fn
  models
  render-fn
  rendered-models
  spec])

(mr/def ::candidates-options
  "What a `:candidates` fn takes: the collections to look in, a set (a nil member means the root) or `:all`, and the date
  before which content that was last used is stale."
  [:map {:closed true}
   [:collection-ids [:or [:= :all] [:set [:maybe :int]]]]
   [:cutoff-date    :time/local-date]])

(defn collection-filter
  "HoneySQL condition scoping `collection-id-column` to `(:collection-ids args)`, or nil (no filtering)
  when `:collection-ids` is `:all`. A nil member of the set selects root-level content."
  [collection-id-column {:keys [collection-ids]}]
  (when (set? collection-ids)
    [:or
     (when (contains? collection-ids nil)
       [:is collection-id-column nil])
     [:in collection-id-column collection-ids]]))

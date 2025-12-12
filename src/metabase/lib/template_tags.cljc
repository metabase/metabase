(ns metabase.lib.template-tags
  (:refer-clojure :exclude [not-empty])
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.template-tag :as lib.schema.template-tag]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [not-empty]]))

(mu/defn template-tags->card-ids :- [:maybe [:set {:min 1} ::lib.schema.id/card]]
  "Returns the card IDs from the template tags map."
  [template-tags :- [:maybe ::lib.schema.template-tag/template-tag-map]]
  (->> (vals template-tags)
       (into #{} (keep :card-id))
       not-empty))

(mu/defn template-tags->snippet-ids :- [:maybe [:set {:min 1} ::lib.schema.id/native-query-snippet]]
  "Returns the snippet IDs from the template tags map."
  [template-tags :- [:maybe ::lib.schema.template-tag/template-tag-map]]
  (->> (vals template-tags)
       (into #{} (keep :snippet-id))
       not-empty))

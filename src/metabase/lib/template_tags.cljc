(ns metabase.lib.template-tags
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.template-tag :as lib.schema.template-tag]
   [metabase.util.malli :as mu]))

(mu/defn template-tags->card-ids :- [:maybe [:set {:min 1} ::lib.schema.id/card]]
  "Returns the card IDs from the sequence of template tags."
  [template-tags :- [:sequential ::lib.schema.template-tag/template-tag]]
  (not-empty (into #{} (keep (fn [[_k m]] (:card-id m))) template-tags)))

(mu/defn template-tags->snippet-ids :- [:maybe [:set {:min 1} ::lib.schema.id/native-query-snippet]]
  "Returns the snippet IDs from the sequence of template tags."
  [template-tags :- [:sequential ::lib.schema.template-tag/template-tag]]
  (not-empty (into #{} (keep (fn [[_k m]] (:snippet-id m))) template-tags)))

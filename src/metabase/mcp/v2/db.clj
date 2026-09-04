(ns metabase.mcp.v2.db
  "Application-database reads for the v2 MCP tools. Toucan calls live here so the tool namespaces
   stay argument handling, gating and projection."
  (:require
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn card
  "The Card row with `card-id`, or nil when there is no such Card."
  [card-id]
  (t2/select-one :model/Card :id card-id))

(defn hydrate-moderation-reviews
  "`card` with `:moderation_reviews` hydrated, each review carrying its `:moderator_details`."
  [card]
  (t2/hydrate card [:moderation_reviews :moderator_details]))

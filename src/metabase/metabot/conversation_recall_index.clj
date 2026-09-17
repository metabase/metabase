(ns metabase.metabot.conversation-recall-index
  "Enterprise-backed search index for past conversations. Reads always require an explicit owner."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise search
  "Hybrid search restricted to an owner. Returns status and candidate excerpts; unavailable in OSS."
  metabase-enterprise.metabot.conversation-recall-index
  [_user-id _excluded-id _query _conversation-id]
  {:status :unavailable :results []})

(defenterprise request-sync!
  "Enqueue background reconciliation without blocking the caller. No-op in OSS."
  metabase-enterprise.metabot.conversation-recall-index
  [_conversation-id]
  nil)

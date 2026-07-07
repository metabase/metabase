(ns metabase-enterprise.entity-retrieval.health
  "Health-inspector check for NLQ (natural-language-query) curated retrieval.

  The `:nlq` Metabot profile normally discovers data through the curated `retrieve_library_entities` tool,
  but when the library index can't serve, `get-profile` silently swaps in the `:nlq-fallback` profile
  (general keyword/fulltext search) -- answers keep coming, so the degradation is invisible; this check
  makes it visible.
  Health is status-style: 100 = curated tool serving, 0 = enabled but on the fallback (the `:message`
  names why).
  A not-enabled instance returns nil, so the check is omitted rather than reported as a misleading 100.

  Reuses the embedding-service probe and circuit-breaker state from
  [[metabase-enterprise.semantic-search.health]] / [[metabase-enterprise.semantic-search.embedding]]."
  (:require
   [metabase-enterprise.entity-retrieval.core :as entity-retrieval]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.health :as semantic.health]
   [metabase.health-inspector.core :as health-inspector]))

(set! *warn-on-reflection* true)

(defn- healthy [message] {:health 100 :message message})
(defn- degraded [message] {:health 0 :message message})

(defn nlq-retrieval-health-check
  "Health-inspector check for NLQ curated retrieval, registered as `:nlq-retrieval`.
  Returns nil when the feature isn't enabled (so the check is omitted), otherwise a `{:health :message}`
  map: healthy when the curated index can serve queries and the embedding service is reachable; degraded
  (naming the cause) whenever the agent would silently fall back to general search."
  []
  (let [{:keys [pgvector? licensed? index-compatible? populated?]} (entity-retrieval/retrieval-status)]
    (cond
      (not (and pgvector? licensed?))
      nil ;; not enabled — nothing to check (omitted rather than reported as healthy)

      (not index-compatible?)
      (degraded (str "NLQ curated index not built for the current embedding model (rebuild pending) — "
                     "agent on general-search fallback."))

      (not populated?)
      (degraded "NLQ curated index empty (first reconcile pending) — agent on general-search fallback.")

      (semantic.embedding/embedder-circuit-open?)
      (degraded "Embedding service circuit open — NLQ curated retrieval unavailable.")

      :else
      (let [{:keys [reachable? error]} (semantic.health/embedding-service-reachable?)]
        (if reachable?
          (healthy "NLQ curated retrieval available and serving.")
          (degraded (str "Embedding service unreachable: " error
                         " — NLQ curated retrieval unavailable.")))))))

(health-inspector/register-check! :nlq-retrieval nlq-retrieval-health-check)

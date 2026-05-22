(ns metabase.metabot.quality.core
  "Public surface for the Metabot conversation quality-score pipeline.

  See `notes/bot-1569/quality-score-impl.md` for the full design. This
  namespace is the I/O wrapper called from
  `metabase.metabot.persistence/finalize-assistant-turn!`; pure-compute
  layers (extract / governance / temporal / concern-signals / subscores /
  attribution) ship in later phases.

  Phase 1 ships a stub: `score-conversation!` writes a sentinel breakdown
  shape so the end-to-end integration is proven before any real compute
  lands."
  (:require
   [metabase.metabot.quality.constants :as quality.constants]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- sentinel-breakdown
  "JSON shape persisted as `metabot_conversation.quality_breakdown` for
  conversations the pipeline declines to score. `quality_score` stays NULL.
  Reasons in use today: `pre-foundation`, `extract-error`, `stub` —
  documented in `notes/bot-1569/quality-score-impl.md` §Sentinel breakdowns.

  Writing a sentinel is what stops the backfill task from re-discovering
  the row tomorrow (discovery is `WHERE quality_breakdown IS NULL`)."
  [reason]
  (json/encode {:version     quality.constants/composite-version
                :unscoreable reason}))

(defn- write-sentinel!
  "Persist the sentinel breakdown for `conversation-id`. `quality_score`
  remains NULL."
  [conversation-id reason]
  (t2/update! :model/MetabotConversation conversation-id
              {:quality_breakdown (sentinel-breakdown reason)}))

(defn score-conversation!
  "Compute and persist the quality score + per-turn attribution for
  `conversation-id`.

  Phase 1 stub: writes the `\"stub\"` sentinel breakdown and returns
  `:sentinel`. Real compute lands in Phase 6.

  Return contract (stable across phases):
    number    — clean composite score in [0, 1]
    :sentinel — sentinel breakdown written; `quality_score` stays NULL
    nil       — throw caught by the inner safety guard, no UPDATE fired.

  The inner try/catch is log-only at MVP — Prometheus / Snowplow
  instrumentation is a follow-up task (see §Out of scope in the impl plan)."
  [conversation-id]
  (try
    (write-sentinel! conversation-id "stub")
    :sentinel
    (catch Throwable t
      (log/error t "score-conversation! threw"
                 {:conversation-id conversation-id})
      nil)))

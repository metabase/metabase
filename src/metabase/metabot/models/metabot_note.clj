(ns metabase.metabot.models.metabot-note
  "Persistent notes the experimental megabot profile reads and writes across conversations.

   A note is a durable instance fact the agent chooses to remember — a schema quirk, which tables
   are trustworthy, how a metric is defined here, a piece of saved SQL. Notes are shared across the
   instance (any megabot user sees them); `creator_id` records who last wrote one. The agent sees a
   catalog of `note_key` + `summary` in its system prompt and pulls a note's full `content` on demand
   via the `read_note` tool."
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/MetabotNote [_model] :metabot_note)

(doto :model/MetabotNote
  (derive :metabase/model)
  (derive :hook/timestamped?))

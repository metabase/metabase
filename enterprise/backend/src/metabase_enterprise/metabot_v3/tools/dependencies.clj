(ns metabase-enterprise.metabot-v3.tools.dependencies
  (:require
   [metabase-enterprise.dependencies.api :as dependencies.api]
   [metabase-enterprise.metabot-v3.tools.util :as metabot-v3.tools.u]))

(defn check-transform-dependencies
  "Check a proposed edit to a transform, and return the card, transform, etc. IDs for things that will break.
  Takes a map with :id (required), :source (optional), and :target (optional) keys."
  [args]
  (try
    {:structured_output (dependencies.api/check-transform-dependencies args)}
    (catch Exception e
      (metabot-v3.tools.u/handle-agent-error e))))

(ns metabase-enterprise.agent-api.init
  "Startup wiring for the enterprise Agent API module — loads the scheduled Agent API usage
  trimmer so its `task/init!` runs on boot (on every EE instance, matching where Agent API usage
  is collected)."
  (:require
   [metabase-enterprise.agent-api.task.agent-api-usage-trimmer]))

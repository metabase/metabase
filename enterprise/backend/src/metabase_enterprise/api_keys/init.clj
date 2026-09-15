(ns metabase-enterprise.api-keys.init
  "Startup wiring for the enterprise API keys module — loads the scheduled API key usage trimmer so
  its `task/init!` runs on boot (on every EE instance, matching where API key usage is collected)."
  (:require
   [metabase-enterprise.api-keys.task.api-key-usage-trimmer]))

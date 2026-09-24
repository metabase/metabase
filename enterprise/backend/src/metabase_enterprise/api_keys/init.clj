(ns metabase-enterprise.api-keys.init
  "Startup wiring for the enterprise API keys module — loads the scheduled API key usage trimmer and
  the usage/last_used_at flush loop so their lifecycle methods run on boot (on every EE instance,
  matching where API key usage is collected).

  `metabase-enterprise.api-keys.usage` is a `defenterprise` implementation namespace, which `require`s
  lazily on the *first call* to `metabase.api-keys.usage/record-api-key-usage!` — too late for its
  `task/init!` (trimmer) and `startup/def-startup-logic!`/`def-shutdown-logic!` (flush loop)
  registrations, which are each walked once at boot/shutdown. Requiring it here forces it to load up
  front instead."
  (:require
   [metabase-enterprise.api-keys.task.api-key-usage-trimmer]
   [metabase-enterprise.api-keys.usage]))

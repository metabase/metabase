(ns metabase.events.init
  "Load event handlers that need to be loaded on system startup for side effects. Most of these namespaces should
  actually get moved to appropriate modules instead of having all tasks live here -- see
  https://www.notion.so/metabase/Backend-Modularization-2025-Plan-17669354c90180b98bd4eb9c8ccf2395.

  See https://metaboat.slack.com/archives/CKZEMT1MJ/p1736556522733279 for rationale behind this pattern."
  (:require
   [metabase.events.alerts-deleted-on-card-save]
   [metabase.events.audit-log]
   [metabase.events.driver-notifications]
   [metabase.events.last-login]
   [metabase.events.notification]
   [metabase.events.persisted-info]
   [metabase.events.recent-views]
   [metabase.events.revision]
   [metabase.events.schema]
   [metabase.events.slack]
   [metabase.events.sync-database]
   [metabase.events.view-log]))

(ns metabase-enterprise.core.init
  "Loads all enterprise namespaces that need to be loaded for side effects on system launch. By convention, these
  namespaces should follow the pattern

    metabase-enterprise.<module-name>.init

  See https://metaboat.slack.com/archives/CKZEMT1MJ/p1736556522733279 for rationale behind this pattern."
  (:require
   [metabase-enterprise.action-v2.init]
   [metabase-enterprise.advanced-config.init]
   [metabase-enterprise.audit-app.init]
   [metabase-enterprise.cache.init]
   [metabase-enterprise.database-replication.init]
   [metabase-enterprise.dependencies.init]
   [metabase-enterprise.gsheets.init]
   [metabase-enterprise.llm.init]
   [metabase-enterprise.metabot-v3.init]
   [metabase-enterprise.remote-sync.init]
   [metabase-enterprise.scim.init]
   [metabase-enterprise.semantic-search.init]
   [metabase-enterprise.sso.init]
   [metabase-enterprise.stale.init]
   [metabase-enterprise.support-access-grants.init]
   [metabase-enterprise.transforms-python.init]
   [metabase-enterprise.workspaces.init]))

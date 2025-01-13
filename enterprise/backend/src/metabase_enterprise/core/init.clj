(ns metabase-enterprise.core.init
  "Loads all enterprise namespaces that need to be loaded for side effects on system launch. By convention, these
  namespaces should follow the pattern

    metabase-enterprise.<module-name>.init

  See https://metaboat.slack.com/archives/CKZEMT1MJ/p1736556522733279 for rationale behind this pattern."
  (:require
   [metabase-enterprise.enhancements.init]))

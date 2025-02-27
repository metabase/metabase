(ns metabase.driver.init
  "Load driver namespaces that need to be loaded on system startup for side effects.

  See https://metaboat.slack.com/archives/CKZEMT1MJ/p1736556522733279 for rationale behind this pattern."
  (:require
   ;; Load up the drivers shipped as part of the main codebase, so they will show up in the list of available DB types
   [metabase.driver.h2]
   [metabase.driver.mysql]
   [metabase.driver.postgres]))

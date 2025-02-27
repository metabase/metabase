(ns metabase.logger.init
  "Load driver namespaces that need to be loaded on system startup for side effects.

  See https://metaboat.slack.com/archives/CKZEMT1MJ/p1736556522733279 for rationale behind this pattern."
  (:require
   ;; Make sure the custom Metabase logger code gets loaded up so we use our custom logger for performance reasons. TODO
   ;; -- this namespace doesn't follow the module namespace naming pattern and should get moved to
   ;; `metabase.logger.core` or something like that.
   [metabase.logger]))

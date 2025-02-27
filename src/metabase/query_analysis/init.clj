(ns metabase.query-analysis.init
  "Code that should be loaded on system startup for side effects.

  See https://metaboat.slack.com/archives/CKZEMT1MJ/p1736556522733279 for rationale behind this pattern."
  (:require
   [metabase.query-analysis.task.analyze-queries]
   [metabase.query-analysis.task.sweep-query-analysis]))

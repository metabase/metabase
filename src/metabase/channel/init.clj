(ns metabase.channel.init
  "Load channel implementation namespaces for side effects on system launch. See
  https://metaboat.slack.com/archives/CKZEMT1MJ/p1736556522733279 for rationale behind this pattern."
  (:require
   [metabase.channel.impl.email]
   [metabase.channel.impl.http]
   [metabase.channel.impl.slack]))

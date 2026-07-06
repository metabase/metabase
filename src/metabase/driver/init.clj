(ns metabase.driver.init
  "Load driver namespaces that need to be loaded on system startup for side effects.

  See https://metaboat.slack.com/archives/CKZEMT1MJ/p1736556522733279 for rationale behind this pattern."
  (:require
   [metabase.config.core :as config]
   ;; for the default [[metabase.driver/table-rows-sample]] implementation
   [metabase.driver.common.table-rows-sample]
   [metabase.driver.events.driver-notifications]
   [metabase.driver.events.report-timezone-updated]
   ;; Load up the drivers shipped as part of the main codebase, so they will show up in the list of available DB types
   [metabase.driver.mysql]
   [metabase.driver.postgres]
   [metabase.driver.settings]
   ;; for the `:sql-jdbc` implementation of [[metabase.driver/incorporate-ssh-tunnel-details]]
   [metabase.driver.sql-jdbc.connection.ssh-tunnel]
   [metabase.driver.sqlite]))

;; H2 is an *optional* driver: the OSS build bundles the H2 JDBC JAR but the EE build does not. Load
;; [[metabase.driver.h2]] (so H2 shows up as an available DB type, and so its app-db/cache/search glue gets
;; registered) only when the H2 JAR is on the classpath. That namespace `:import`s `org.h2.*` classes, so it ships as
;; *source* and is compiled here lazily, at runtime -- requiring it unconditionally (or AOT-compiling it) would break
;; boot when H2 is absent. The check is at *runtime*, not compile time, so EE users who supply the H2 JAR after the
;; jar was built (via the plugins dir or `-cp`) still get H2 support. See [[metabase.config.core/h2-available?]].
(when (config/h2-available?)
  (require 'metabase.driver.h2))

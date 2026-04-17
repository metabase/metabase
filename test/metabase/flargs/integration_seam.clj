(ns metabase.flargs.integration-seam
  "Test-only main-side seam. Defines a [[defflarg]] whose default returns `:default`. The flarg-side
  impl in `metabase.flarg.test-flarg.core` (on the classpath only when `:flarg/test-flarg` is
  active) overrides this to return `:impl`. Used by [[metabase.flargs.integration-test]]."
  (:require
   [metabase.flargs.core :as flargs]))

(flargs/defflarg test-fn
  "Default: returns `:default`. The flarg-side impl in `metabase.flarg.test-flarg.core` overrides
  this to return `:impl` when the flarg is enabled."
  :flarg/test-flarg
  metabase.flarg.test-flarg.core
  []
  :default)

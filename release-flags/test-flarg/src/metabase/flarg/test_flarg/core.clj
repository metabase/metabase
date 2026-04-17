(ns metabase.flarg.test-flarg.core
  "Flarg-side impl of the [[metabase.flargs.integration-seam/test-fn]] seam. Only on the classpath
  when the `:flarg/test-flarg` alias is active.

  Registering its impl (via the `defflarg` form below) is what proves the end-to-end machinery
  works: classpath presence of this ns causes the seam's dispatcher to route to `:impl` instead of
  `:default`."
  (:require
   [metabase.flargs.core :as flargs]))

(flargs/defflarg test-fn
  "Flarg-side impl: returns `:impl`. Verifies that when the flarg ns is on the classpath, the
  dispatcher routes calls to the flarg impl rather than the main-side default."
  :flarg/test-flarg
  metabase.flarg.test-flarg.core
  []
  :impl)

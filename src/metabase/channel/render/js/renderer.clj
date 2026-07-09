(ns metabase.channel.render.js.renderer
  "Hands callers the static-viz [[metabase.channel.render.js.protocol/StaticVizRenderer]] implementation.
  `MB_STATIC_VIZ_RENDERER` selects it:

    * `quickjs` (the default) — [[metabase.channel.render.js.quickjs]], out-of-process on sandboxed
      native QuickJS workers, keeping the JS heap out of the JVM.
    * `graal` — [[metabase.channel.render.js.graal]], in-process on pooled GraalVM contexts. Also the
      fallback on platforms without a static-viz worker binary.

  Kept behind the protocol so callers ([[metabase.channel.render.js.svg]],
  [[metabase.channel.render.js.color]]) don't care which backend runs."
  (:require
   [metabase.channel.render.js.graal :as graal]
   [metabase.channel.render.js.quickjs :as quickjs]
   [metabase.config.core :as config]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private warn-quickjs-unavailable!
  (delay (log/warn (str "No static-viz worker binary is available for this platform"
                        " (see native/static-viz-worker/README.md);"
                        " using the GraalVM renderer"))))

(defn renderer
  "The static-viz renderer."
  []
  (cond
    (= (config/config-str :mb-static-viz-renderer) "graal")
    (graal/renderer)

    (quickjs/available?)
    (quickjs/renderer)

    :else
    (do @warn-quickjs-unavailable!
        (graal/renderer))))

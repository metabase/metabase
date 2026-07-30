(ns metabase.channel.render.js.renderer
  "Hands callers the static-viz [[metabase.channel.render.js.protocol/StaticVizRenderer]] implementation.
  `MB_STATIC_VIZ_RENDERER` selects it:

    * `quickjs` (the default) — [[metabase.channel.render.js.quickjs]], pooled native QuickJS contexts
      whose memory lives outside the JVM heap. Requires a libstaticviz build for the platform; GraalVM
      is the fallback without one.
    * `graal` — [[metabase.channel.render.js.graal]], pooled GraalVM contexts on the JVM heap.

  Kept behind the protocol so callers ([[metabase.channel.render.js.svg]],
  [[metabase.channel.render.js.color]]) don't care which backend runs."
  (:require
   [metabase.channel.render.js.graal :as graal]
   [metabase.channel.render.js.quickjs :as quickjs]
   [metabase.config.core :as config]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private warn-quickjs-unavailable!
  (delay (log/warn (str "No libstaticviz build is available for this platform"
                        " (see native/static-viz-quickjs/README.md);"
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

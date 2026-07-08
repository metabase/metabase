(ns metabase.channel.render.js.renderer
  "Picks the static-viz [[metabase.channel.render.js.protocol/StaticVizRenderer]] implementation for the
  configured [[metabase.channel.settings/static-viz-mode]]: the in-process GraalVM renderer
  (default) or the remote HTTP renderer."
  (:require
   [metabase.channel.render.js.graal :as graal]
   [metabase.channel.render.js.remote :as remote]
   [metabase.channel.settings :as channel.settings]))

(set! *warn-on-reflection* true)

(defn renderer
  "The static-viz renderer for the configured mode."
  []
  (if (= :remote (channel.settings/static-viz-mode))
    (remote/renderer (channel.settings/static-viz-remote-url))
    (graal/renderer)))

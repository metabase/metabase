;; The protocol implemented by the static-viz renderers.
(ns metabase.channel.render.js.protocol
  "The strongly-typed protocol implemented by the static-viz renderers
  ([[metabase.channel.render.js.graal]] and [[metabase.channel.render.js.remote]]). Callers get the
  configured implementation from [[metabase.channel.render.js.renderer/renderer]] and invoke these
  methods on it.")

(set! *warn-on-reflection* true)

(defprotocol StaticVizRenderer
  "Renders static visualizations. Each method takes a plain map of arguments and returns the raw string
  the corresponding static-viz bundle function produces (a JSON string)."
  (chart [renderer input]
    "Render one chart. `input` is a map: the default isomorphic path takes
    `{:rawSeries .. :dashcardSettings .. :options ..}`; legacy charts take `{:kind \"funnel\"|\"gauge\" ..}`
    plus that kind's fields. Returns a JSON `{type, content}` string.")
  (cell-background-colors [renderer input]
    "Compute pulse table cell background colors. `input` is `{:rows .. :cols .. :settings .. :cells ..}`.
    Returns a JSON array of color strings (or null), positionally."))

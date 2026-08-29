;; The protocol implemented by the static-viz renderers.
(ns metabase.channel.render.js.protocol
  "The strongly-typed protocol implemented by the static-viz renderers (currently
  [[metabase.channel.render.js.graal]]). Callers get the implementation from
  [[metabase.channel.render.js.renderer/renderer]] and invoke these methods on it.")

(set! *warn-on-reflection* true)

(defprotocol StaticVizRenderer
  "Renders static visualizations. Each method takes a plain map of arguments and returns the corresponding
  static-viz bundle function's result parsed from JSON into Clojure data."
  (chart [renderer input]
    "Render one chart. `input` is a map: the default isomorphic path takes
    `{:rawSeries .. :dashcardSettings .. :options ..}`; legacy charts take `{:kind \"funnel\"|\"gauge\" ..}`
    plus that kind's fields. Returns a keywordized `{:type .. :content ..}` map.")
  (cell-background-colors [renderer input]
    "Compute pulse table cell background colors. `input` is `{:rows .. :cols .. :settings .. :cells ..}`.
    Returns a vector of color strings (or nil), positionally."))

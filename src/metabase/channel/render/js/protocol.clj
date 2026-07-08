;; The protocol for the static-viz renderers.
(ns metabase.channel.render.js.protocol
  "A single strongly-typed protocol over the static-viz renderers — visualizations (charts, see
  [[metabase.channel.render.js.svg]]) and pulse table cell coloring (see
  [[metabase.channel.render.js.color]]).

  Two implementations of [[StaticVizRenderer]] are selected by the
  [[metabase.channel.settings/static-viz-renderer-mode]] setting:

    - `:graalvm` runs the static-viz JS in-process on a pooled sandboxed GraalVM context (the default);
      see [[metabase.channel.render.js.graal]].
    - `:remote`  makes HTTP calls to an external static-viz service (see
      [[metabase.channel.render.js.remote]] and frontend/src/metabase-static-viz/app.ts).

  Callers get the configured implementation from [[renderer]] and invoke the protocol methods on it."
  (:require
   [metabase.channel.settings :as channel.settings]))

(set! *warn-on-reflection* true)

(defprotocol StaticVizRenderer
  "Renders static visualizations. Each method takes a plain map of arguments and returns the raw string
  the corresponding static-viz bundle function produces (a JSON string)."
  (visualization [renderer viz]
    "Render one visualization. `viz` is a map: the default isomorphic path takes
    `{:rawSeries .. :dashcardSettings .. :options ..}`; legacy charts take
    `{:kind \"funnel\"|\"gauge\" ..}` plus that kind's fields. Returns a JSON `{type, content}` string.")
  (cell-background-colors [renderer opts]
    "Compute pulse table cell background colors. `opts` is `{:rows .. :cols .. :settings .. :cells ..}`.
    Returns a JSON array of color strings (or null), positionally."))

;; The implementations require this namespace for the protocol, so resolve them lazily (a runtime
;; require) to avoid a compile-time cycle.
(def ^:private graalvm-renderer
  (delay ((requiring-resolve 'metabase.channel.render.js.graal/renderer))))

(defn renderer
  "The [[StaticVizRenderer]] for the configured [[metabase.channel.settings/static-viz-renderer-mode]]."
  []
  (if (= :remote (channel.settings/static-viz-renderer-mode))
    ((requiring-resolve 'metabase.channel.render.js.remote/renderer)
     (channel.settings/static-viz-renderer-remote-url))
    @graalvm-renderer))

(ns metabase.channel.render.js.common
  "Shared helpers for pooled static-viz renderers (see [[metabase.channel.render.js.graal]]): the graal
  bundle's classpath path, the test-init guard, and the per-render-batch JS timing summary."
  (:require
   [metabase.config.core :as config]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def bundle-resource-path
  "Classpath path of the built static-viz bundle the graal renderer evaluates in-process."
  "frontend_client/app/dist/lib-static-viz.bundle.js")

(def custom-viz-bundle-resource-path
  "Classpath path of the slim custom-viz-only static-viz bundle loaded into the untrusted plugin isolate: the
  same render interface as [[bundle-resource-path]], but without the built-in chart implementations
  (ECharts/visx), which that isolate never renders."
  "frontend_client/app/dist/lib-static-viz-custom.bundle.js")

(def ^:dynamic *js-call-stats*
  "When bound to an atom holding `{engine {:calls n, :ms total}}` (see [[do-with-js-call-summary]]), the
  renderer records each built-in static-viz JS call into it, so a multi-card render (a whole dashboard
  subscription, say) can log one summary line instead of being read call-by-call."
  nil)

(defn record-js-call!
  "Record one built-in JS call of `ms` on `engine` (`:trusted`/`:untrusted`) into [[*js-call-stats*]], when
  a summary is being collected."
  [engine ms]
  (when *js-call-stats*
    (swap! *js-call-stats* update engine
           (fn [{:keys [calls total-ms], :or {calls 0, total-ms 0.0}}]
             {:calls (inc calls), :total-ms (+ total-ms ms)}))))

(defn do-with-js-call-summary
  "Collect built-in static-viz JS call timings while `f` runs, then log one INFO summary line per engine
  used, prefixed with `label`. Logs nothing when `f` made no JS calls. See [[with-js-call-summary]]."
  [label f]
  (binding [*js-call-stats* (atom {})]
    (try
      (f)
      (finally
        (doseq [[engine {:keys [calls total-ms]}] @*js-call-stats*]
          (log/infof "static-viz: %s summary: %s engine executed %d built-in JS call(s) in %.0fms total"
                     label (name engine) calls total-ms))))))

(defmacro with-js-call-summary
  "Run `body` collecting built-in static-viz JS call timings, then log one INFO summary line per engine
  used, prefixed with `label`."
  [label & body]
  `(do-with-js-call-summary ~label (^:once fn* [] ~@body)))

(defn assert-tests-not-initializing!
  "Guard against loading the static-viz bundle as a side effect of loading namespaces: it might not have
  been built yet. If it hasn't, we want a meaningful error (see the fixture in
  [[metabase.channel.render.js.svg-test]]) rather than a meaningless failure at test-runner startup."
  []
  (when config/tests-available?
    ((requiring-resolve 'mb.hawk.init/assert-tests-are-not-initializing) "(mt/id ...) or (data/id ...)")))

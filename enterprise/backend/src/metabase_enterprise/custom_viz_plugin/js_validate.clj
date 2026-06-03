(ns metabase-enterprise.custom-viz-plugin.js-validate
  "Headless, execution-based validation for Metabot-generated custom visualization
   factory JS.

   The frontend evaluates a plugin bundle in a `near-membrane` sandbox, calls the
   factory with `{ defineSetting, locale }`, then drives the returned definition
   through `checkRenderable -> mount -> update -> unmount`. A factory with a syntax
   error, a missing `mount`, an unsupported setting widget, or a runtime crash only
   surfaces in the browser today, after the tool has already reported success.

   This namespace runs the same lifecycle on the backend in a sandboxed GraalJS
   context (no host access, no real DOM) using the permissive shim in
   `resources/custom-viz/validate-harness.js`, so the create-custom-visualization
   tool can reject malformed plugins and hand the agent an actionable error before
   anything reaches the frontend."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.channel.render.js.engine :as js.engine]
   [metabase.util.json :as json])
  (:import
   (org.graalvm.polyglot Context PolyglotException Value)))

(set! *warn-on-reflection* true)

(def ^:private harness-resource
  "Classpath resource holding the DOM shim + `__validate__` driver."
  "custom-viz/validate-harness.js")

(defn- clean-polyglot-message
  "Trim GraalJS noise from a PolyglotException message down to the JS error line."
  [^Throwable e]
  (-> (or (ex-message e) (str e))
      (str/replace-first #"^(?:org\.graalvm\.polyglot\.PolyglotException: )?" "")
      str/trim))

(defn run-validation
  "Execute `bundle-js` (the wrapped `dist/index.js` that assigns
   `globalThis.__customVizPlugin__`) through the validation harness.

   `sample` is `{:series <vector> :settings <map>}` — a representative dataset the
   plugin is exercised against. Returns a result map:

     {:ok true  :renderable-error <string-or-nil>}                       ; passed
     {:ok false :stage <string> :error <string> :renderable-error ...}   ; failed

   Never throws for a plugin-level problem (those are returned as `:ok false`).
   Only an unexpected harness/runtime fault propagates."
  [^String bundle-js {:keys [series settings]}]
  (let [^Context ctx (js.engine/context)]
    (try
      (js.engine/load-resource ctx harness-resource)
      ;; Evaluate the plugin bundle. A syntax error (e.g. truncated / malformed
      ;; code) throws here — that is the single most common failure, so report it
      ;; crisply rather than letting it look like a harness fault.
      (try
        (js.engine/load-js-string ctx bundle-js "plugin-bundle.js")
        (catch PolyglotException e
          (throw (ex-info "syntax" {::result {:ok false
                                              :stage "syntax"
                                              :error (str "JavaScript syntax/parse error in factory_js: "
                                                          (clean-polyglot-message e))}}))))
      ;; Inject the sample dataset as plain JSON (valid JS object literals).
      (js.engine/load-js-string
       ctx
       (str "globalThis.__SERIES__ = " (json/encode (or series [])) ";\n"
            "globalThis.__SETTINGS__ = " (json/encode (or settings {})) ";")
       "plugin-data.js")
      (let [^Value result-val (.eval ctx "js" "__validate__()")
            result            (json/decode+kw (.asString result-val))]
        (set/rename-keys result {:renderableError :renderable-error}))
      (catch clojure.lang.ExceptionInfo e
        (if-let [result (::result (ex-data e))]
          result
          (throw e)))
      (finally
        (.close ctx)))))

;;; ------------------------------------------------ Sample dataset ------------------------------------------------

(def ^:private generic-cols
  "A generic two-column shape (one category dimension, one numeric metric) used to
   smoke-test a plugin's mount lifecycle when no real query columns are available."
  [{:name "category" :display_name "Category" :base_type "type/Text"    :source "breakout"}
   {:name "value"    :display_name "Value"    :base_type "type/Integer" :source "aggregation"}])

(def ^:private generic-rows
  [["Alpha" 120] ["Bravo" 90] ["Charlie" 60] ["Delta" 45] ["Echo" 30]])

(defn generic-sample
  "A best-effort generic `{:series :settings}` for the mount smoke-test."
  [settings]
  {:series   [{:data {:rows generic-rows :cols generic-cols}}]
   :settings (or settings {})})

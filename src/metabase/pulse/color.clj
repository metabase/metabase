(ns metabase.pulse.color
  "Namespaces that uses the Nashorn javascript engine to invoke some shared javascript code that we use to determine
  the background color of pulse table cells"
  (:require [cheshire.core :as json]
            [metabase.util.i18n :refer [trs]]
            [schema.core :as s])
  (:import java.io.InputStream
           [javax.script Invocable ScriptEngine ScriptEngineManager]
           [jdk.nashorn.api.scripting JSObject ScriptObjectMirror]))

(defn- make-js-engine-with-script [^String script]
  (let [engine-mgr (ScriptEngineManager.)
        js-engine  (.getEngineByName engine-mgr "nashorn")]
    (.eval js-engine script)
    js-engine))

(defn- ^InputStream get-classpath-resource [path]
  (.getResourceAsStream (class []) path))

(def ^:private js-engine
  (let [js-file-path "/frontend_shared/color_selector.js"]
    ;; The code that loads the JS engine is behind a delay so that we don't incur that cost on startup. The below
    ;; assertion till look for the javascript file at startup and fail if it doesn't find it. This is to avoid a big
    ;; delay in finding out that the system is broken
    (assert (get-classpath-resource js-file-path)
      (trs "Can't find JS color selector at ''{0}''" js-file-path))
    (delay
     (with-open [stream (get-classpath-resource js-file-path)]
       (make-js-engine-with-script (slurp stream))))))

(def ^:private QueryResults
  "This is a pretty loose schema, more as a safety net as we have a long feedback loop for this being broken as it's
  being handed to the JS color picking code. Currently it just needs column names from `:cols`, and the query results
  from `:rows`"
  {:cols [{:name s/Str
           s/Any s/Any}]
   :rows [[s/Any]]
   s/Any s/Any})

(s/defn make-color-selector
  "Returns a curried javascript function (object) that can be used with `get-background-color` for delegating to JS
  code to pick out the correct color for a given cell in a pulse table. The logic for picking a color is somewhat
  complex, but defined in a set of rules in `viz-settings`. There are some colors that are picked based on a
  particular cell value, others affect the row, so it's necessary to call this once for the resultset and then
  `get-background-color` on each cell."
  [{:keys [cols rows]} :- QueryResults, viz-settings]
  ;; NOTE: for development it is useful to replace the following line with this one so it reload each time:
  ; (let [^Invocable engine (make-js-engine-with-script (slurp "resources/frontend_shared/color_selector.js"))
  (let [^Invocable engine @js-engine
        ;; Ideally we'd convert everything to JS data before invoking the function below, but converting rows would be
        ;; expensive. The JS code is written to deal with `rows` in it's native Nashorn format but since `cols` and
        ;; `viz-settings` are small, pass those as JSON so that they can be deserialized to pure JS objects once in JS code
        js-fn-args (object-array [rows (json/generate-string cols) (json/generate-string viz-settings)])]
    (.invokeFunction engine "makeCellBackgroundGetter" js-fn-args)))

(defn get-background-color
  "Get the correct color for a cell in a pulse table. This is intended to be invoked on each cell of every row in the
  table. See `make-color-selector` for more info."
  [^JSObject color-selector cell-value column-name row-index]
  (.call color-selector color-selector (object-array [cell-value row-index column-name])))

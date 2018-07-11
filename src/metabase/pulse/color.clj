(ns metabase.pulse.color
  "Namespaces that uses the Nashorn javascript engine to invoke some shared javascript code that we use to determine
  the background color of pulse table cells"
  (:require [clojure.walk :as walk]
            [puppetlabs.i18n.core :refer [trs]])
  (:import java.io.InputStream
           [javax.script Invocable ScriptEngineManager]
           jdk.nashorn.api.scripting.JSObject))

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

(defn- make-args-array
  "Useful for converting `args` into an object array which is necessary for invoking a varargs Java method via
  Clojure"
  [& args]
  (let [^objects args-array (make-array Object (count args))]
    (doall (map-indexed (fn [idx arg]
                          (aset args-array idx arg)) args))
    args-array))

(defn make-color-selector
  "Returns a curried javascript function (object) that can be used with `get-background-color` for delegating to JS
  code to pick out the correct color for a given cell in a pulse table. The logic for picking a color is somewhat
  complex, but defined in a set of rules in `viz-settings`. There are some colors that are picked based on a
  particular cell value, others affect the row, so it's necessary to call this once for the resultset and then
  `get-background-color` on each cell."
  [data viz-settings]
  (let [^Invocable engine @js-engine]
    (->> viz-settings
         ;; Keyword strings don't serialize correctly when being passed to the JS engine
         walk/stringify-keys
         (make-args-array data)
         (.invokeFunction engine "makeCellBackgroundGetter"))))

(defn get-background-color
  "Get the correct color for a cell in a pulse table. This is intended to be invoked on each cell of every row in the
  table. See `make-color-selector` for more info."
  [^JSObject color-selector cell-value column-name row-index]
  (.call color-selector color-selector (make-args-array cell-value column-name row-index)))

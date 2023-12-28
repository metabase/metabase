(ns metabase.pulse.render.color
  "Namespaces that uses the Nashorn javascript engine to invoke some shared javascript code that we use to determine
  the background color of pulse table cells"
  (:require
   [cheshire.core :as json]
   [clojure.java.io :as io]
   [metabase.formatter]
   [metabase.pulse.render.js-engine :as js]
   [metabase.util.i18n :refer [trs]]
   [schema.core :as s])
  (:import
    (metabase.formatter NumericWrapper)))


(set! *warn-on-reflection* true)

(def ^:private js-file-path "frontend_shared/color_selector.js")

(def ^:private ^{:arglists '([])} js-engine
  ;; The code that loads the JS engine is behind a delay so that we don't incur that cost on startup. The below
  ;; assertion till look for the javascript file at startup and fail if it doesn't find it. This is to avoid a big
  ;; delay in finding out that the system is broken
  (let [file-url (io/resource js-file-path)]
    (assert file-url (trs "Can''t find JS color selector at ''{0}''" js-file-path))
    (let [dlay (delay
                 (doto (js/context)
                   (js/load-resource js-file-path)))]
      (fn []
        @dlay))))

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
  [{:keys [cols rows]} :- QueryResults viz-settings]
  ;; Ideally we'd convert everything to JS data before invoking the function below, but converting rows would be
  ;; expensive. The JS code is written to deal with `rows` in it's native Nashorn format but since `cols` and
  ;; `viz-settings` are small, pass those as JSON so that they can be deserialized to pure JS objects once in JS
  ;; code
  (js/execute-fn-name (js-engine) "makeCellBackgroundGetter"
                      rows
                      (json/generate-string cols)
                      (json/generate-string viz-settings)))
(defn get-background-color
  "Get the correct color for a cell in a pulse table. Returns color as string suitable for use CSS, e.g. a hex string or
  `rgba()` string. This is intended to be invoked on each cell of every row in the table. See `make-color-selector`
  for more info."
  ^String [color-selector cell-value column-name row-index]
  (let [cell-value (if (instance? NumericWrapper cell-value)
                     (:num-value cell-value)
                     cell-value)]
    (.asString (js/execute-fn color-selector cell-value row-index column-name))))

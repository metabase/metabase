(ns metabase.test.util.log
  (:require
    [lambdaisland.glogi :as glogi]
    [metabase.util.log :as log])
  (:require-macros [metabase.test.util.log]))

(def ^:private level-overrides
  {:warning :warn
   :severe  :error
   :shout   :fatal
   :fine    :debug
   :finer   :trace})

(defn- extract-log [{:keys [exception level message]}]
  [(get level-overrides level level) exception message])

;; TODO This does not suppress the logs from actually reaching the console.
;; Perhaps https://github.com/lambdaisland/glogi/issues/24 to add a `clear-handlers!` or similar.
;; Tech debt issue: #39335
#_{:clj-kondo/ignore [:clojure-lsp/unused-public-var]}
(defn do-with-glogi-logs
  "Used internally by the CLJS flavour of [[with-log-messages-for-level]]. Don't call this directly."
  [log-ns level body-fn]
  (let [captured     (atom [])
        handler      (fn [record] (swap! captured conj record))]
    (glogi/add-handler log-ns handler)
    (glogi/set-levels {log-ns (log/glogi-level level)
                       ""     :off})
    (body-fn)
    (glogi/remove-handler log-ns handler)
    (glogi/set-levels {log-ns :info
                       ""     :info})
    (mapv extract-log @captured)))

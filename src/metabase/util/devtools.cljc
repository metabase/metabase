(ns metabase.util.devtools
  "Preload magic to load cljs-devtools. Only imported by dev.js in dev mode; no-op in production."
  ;; This special context is defined only for dev-mode shadow-cljs builds; see shadow-cljs.edn
  ;; In release builds, and JVM Clojure, this file is an empty namespace.
  #?(:cljs-dev (:require
                 [devtools.core :as devtools])))

#?(:cljs-dev
   (do
     ;; The advanced mode check is busted, it always assumes Webpack is advanced.
     ;; The reader conditionals empty this file in release builds, plus it's only required
     ;; from frontend/src/metabase/dev.js, which is replaced with dev-noop.js in release mode.
     (devtools/set-pref! :disable-advanced-mode-check true)
     (devtools/install!)
     (js/console.log "CLJS Devtools loaded")))

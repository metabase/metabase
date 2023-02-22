(ns metabase.util.devtools
  "Preload magic to load cljs-devtools. Only imported by dev.js in dev mode; no-op in production."
  (:require
   [devtools.core :as devtools]))

;; The advanced mode check is busted, it always assumes Webpack is advanced.
;; This entire file is skipped for release builds; it's only required from frontend/src/metabase/dev.js
(devtools/set-pref! :disable-advanced-mode-check true)
(devtools/install!)

(js/console.log "CLJS Devtools loaded")

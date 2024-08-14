(ns metabase.util.devtools
  "Preload magic to load cljs-devtools. Only imported by dev.js in dev mode; no-op in production."
  ;; This special context is defined only for dev-mode shadow-cljs builds; see shadow-cljs.edn
  ;; In release builds, and JVM Clojure, this file is an empty namespace.
  #?(:cljs-dev (:require
                 [devtools.core :as devtools]
                 [shadow.cljs.devtools.client.browser])))

#?(:cljs-dev
   (do
     ;; The advanced mode check is busted, it always assumes Webpack is advanced.
     ;; The reader conditionals empty this file in release builds, plus it's only required
     ;; from frontend/src/metabase/dev.js, which is replaced with dev-noop.js in release mode.
     (devtools/set-pref! :disable-advanced-mode-check true)
     (devtools/install!)
     (js/console.log "CLJS Devtools loaded")

     (defonce unload-handler-set? (atom false))

     (defn- ^:dev/after-load on-reload []
       (when (compare-and-set! unload-handler-set? false true)
         (js/console.log "CLJS code hot loaded; setting up webpack invalidation on unload")
         (.addEventListener js/window "beforeunload"
                            (fn [_event]
                              (js/console.log "invalidating webpack build")
                              (js/fetch "http://localhost:8080/webpack-dev-server/invalidate")
                              ;; HACK: Spin-lock to buy time for webpack to actually start rebuilding. Without this
                              ;; there's a race between the invalidation and the refreshed page loading the bundles.
                              (let [target (+ (js/performance.now) 500)]
                                (loop []
                                  (when (< (js/performance.now) target)
                                    (recur))))))))))

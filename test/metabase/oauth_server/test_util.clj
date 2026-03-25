(ns metabase.oauth-server.test-util
  (:require
   [integrant.core :as ig]
   [metabase.oauth-server.system :as system]))

(defmacro with-oauth-system
  "Start a fresh integrant OAuth system with optional config overrides, run body, then halt.
   Temporarily replaces the global system atom so that `get-provider` returns the test system's provider.

   Example:
     (with-oauth-system {}
       (is (some? (system/get-provider))))"
  [config-overrides & body]
  `(let [config# (merge (system/system-config) ~config-overrides)
         sys#    (ig/init config#)]
     (try
       (reset! @#'system/system-atom sys#)
       ~@body
       (finally
         (ig/halt! sys#)
         (reset! @#'system/system-atom nil)))))

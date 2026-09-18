(ns metabase.explorations.test-util
  "Test helpers for the explorations module."
  (:require
   [metabase.api.routes.common :as routes.common]
   [metabase.api.util.handlers :as handlers]
   [metabase.explorations.api :as explorations.api]
   [metabase.server.test-handler :as server.test-handler]))

(set! *warn-on-reflection* true)

(def ^:private api-routes-with-explorations
  "The application's API route tree with `/api/exploration` mounted in front of it, wrapped the same way
  [[metabase.api-routes.routes/route-map]] mounted it before explorations were disabled."
  (delay
    (handlers/routes
     (handlers/route-map-handler {"/exploration" (routes.common/+auth explorations.api/routes)})
     (server.test-handler/app-api-routes))))

(defn do-with-exploration-routes
  "Run `thunk` with `/api/exploration` served by the test HTTP client. The application does not mount the explorations
  API while the feature is disabled, so tests that exercise its endpoints over HTTP need this."
  [thunk]
  (server.test-handler/do-with-api-routes @api-routes-with-explorations thunk))

(defn exploration-routes-fixture
  "`clojure.test` fixture form of [[do-with-exploration-routes]]."
  [f]
  (do-with-exploration-routes f))

(ns metabase.server.middleware.util
  "Ring middleware utility functions. TODO -- consider renaming this to `metabase.server.request.util`.")

(def response-unauthentic "Generic `401 (Unauthenticated)` Ring response map." {:status 401, :body "Unauthenticated"})
(def response-forbidden   "Generic `403 (Forbidden)` Ring response map."       {:status 403, :body "Forbidden"})

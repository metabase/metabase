(ns metabase-enterprise.server.routes
  "The Compojure routes descriptions that are available only when running Metabase® Enterprise Edition™."
  (:require
   #_{:clj-kondo/ignore [:metabase/modules]}
   [compojure.core :refer #_{:clj-kondo/ignore [:discouraged-var]} [defroutes GET]]
   [metabase.server.middleware.embedding-sdk-bundle :as mw.embedding-sdk-bundle]))

#_{:clj-kondo/ignore [:discouraged-var]}
(defroutes ^{:arglists '([request respond raise])} static-files-handler
  "Enterprise Edition static file routes."
  (GET "/embedding-sdk.js" request
    ((mw.embedding-sdk-bundle/serve-bundle-handler) request)))

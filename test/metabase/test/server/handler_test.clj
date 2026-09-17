(ns metabase.test.server.handler-test
  (:require
   [clojure.test :refer :all]
   [metabase.mcp.core :as mcp]
   [metabase.server.core :as server]
   [metabase.test.server.handler :as test.server.handler]))

(deftest make-test-handler-configures-mcp-cors-test
  (let [handler         (fn [_request _respond _raise])
        handler-options (atom nil)]
    (with-redefs [server/make-routes  (fn [_auth-routes _api-routes] handler)
                  server/make-handler (fn [server-routes options]
                                        (reset! handler-options options)
                                        server-routes)]
      (test.server.handler/make-test-handler handler))
    (is (= {:cors mcp/cors} @handler-options))))

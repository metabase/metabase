(ns metabase.test.server.handler-test
  (:require
   [clojure.test :refer :all]
   [metabase.mcp.http-handler :as mcp.http-handler]
   [metabase.server.core :as server]
   [metabase.test :as mt]
   [metabase.test.server.handler]))

(deftest make-test-handler-configures-mcp-test
  (let [handler         (fn [_request _respond _raise])
        handler-options (atom nil)]
    (mt/with-dynamic-fn-redefs [server/make-routes  (fn [_routes] handler)
                                server/make-handler (fn [server-routes options]
                                                      (reset! handler-options options)
                                                      server-routes)]
      (#'metabase.test.server.handler/make-test-handler))
    (is (= #'mcp.http-handler/options @handler-options))))

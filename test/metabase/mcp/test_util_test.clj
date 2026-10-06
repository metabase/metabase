(ns metabase.mcp.test-util-test
  (:require
   [clojure.test :refer :all]
   [metabase.mcp.test-util :as mcp.tu]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn- oauth-rows
  "The number of OAuth client and access token rows."
  []
  [(t2/count :model/OAuthClient) (t2/count :model/OAuthAccessToken)])

(deftest helpers-leave-no-oauth-rows-test
  (testing "the MCP test helpers delete the OAuth client and token they insert, so no live token outlives the call"
    (let [before (oauth-rows)]
      (testing "client-full-response!"
        (is (= 200 (:status (mcp.tu/client-full-response! :rasta :post 200 "metabase-mcp"
                                                          {:jsonrpc "2.0" :method "initialize"
                                                           :params {:capabilities {}} :id 1}))))
        (is (= before (oauth-rows))))
      (testing "do-with-bearer-headers!"
        (mcp.tu/do-with-bearer-headers!
         :rasta mcp.tu/all-scopes
         (fn [headers]
           (is (contains? headers "authorization"))
           (is (not= before (oauth-rows)) "the token exists while the body runs")))
        (is (= before (oauth-rows)))))))

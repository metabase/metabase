(ns metabase-enterprise.sandbox.mcp-ui-credential-test
  "Row-level security applies to the MCP Apps iframe: it runs a stored query handle as the credential's user, so a
  sandboxed user gets only the sandboxed rows."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.test :as met]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.mcp.ui-test-util :as ui.tu]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn- ui-handle-rows!
  "Store a query over every venue under a handle owned by rasta, and run it the way the iframe does, with a UI
  credential holding agent:query:run. Returns the rows."
  []
  (mt/with-model-cleanup [:model/McpQueryHandle]
    (let [{:keys [user-id session-id] :as auth} (ui.tu/ui-auth! :rasta)
          mp     (mt/metadata-provider)
          handle (ui.tu/store-query-handle! session-id user-id
                                            (lib/query mp (lib.metadata/table mp (mt/id :venues))))]
      (get-in (ui.tu/ui-request auth :post 202 (str "embed-mcp/queries/" handle "/run") {})
              [:body :data :rows]))))

(deftest sandboxed-user-credential-gets-only-sandboxed-rows-test
  (testing "The credential's scope lets the iframe run a handle, and rasta's sandbox decides which rows come back"
    (met/with-gtaps! {:gtaps {:venues {:query {:database (mt/id)
                                               :type     :query
                                               :query    {:source-table (mt/id :venues)
                                                          :filter       [:= [:field (mt/id :venues :id) nil] 1]}}}}}
      (is (= 1 (count (ui-handle-rows!)))))
    (testing "control: without the sandbox the same request returns every row"
      (is (= 100 (count (ui-handle-rows!)))))))

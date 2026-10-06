(ns metabase-enterprise.sandbox.mcp-ui-credential-test
  "Row-level security applies to the MCP Apps iframe: its UI credential runs `/api/dataset` as the credential's user,
  so a sandboxed user gets only the sandboxed rows."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.test :as met]
   [metabase.mcp.session :as mcp.session]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]))

(set! *warn-on-reflection* true)

(defn- ui-dataset-rows!
  "Run `query` on `/api/dataset` the way the iframe does, with a UI credential minted for rasta holding
  agent:query:run. Returns the rows."
  [query]
  (let [user-id    (mt/user->id :rasta)
        session-id (mcp.session/create! user-id)
        credential (mcp.session/issue-ui-credential session-id user-id #{"agent:query:run"})]
    (get-in (client/client-full-response :post 202 "dataset"
                                         {:request-options {:headers {"x-metabase-mcp-ui-auth" credential
                                                                      "mcp-session-id"         session-id}}}
                                         query)
            [:body :data :rows])))

(deftest sandboxed-user-credential-gets-only-sandboxed-rows-test
  (testing "The credential's scope lets the iframe reach /api/dataset, and rasta's sandbox decides which rows come
            back"
    (let [venues-query (fn [] {:database (mt/id) :type :query :query {:source-table (mt/id :venues)}})]
      (met/with-gtaps! {:gtaps {:venues {:query {:database (mt/id)
                                                 :type     :query
                                                 :query    {:source-table (mt/id :venues)
                                                            :filter       [:= [:field (mt/id :venues :id) nil] 1]}}}}}
        (is (= 1 (count (ui-dataset-rows! (venues-query))))))
      (testing "control: without the sandbox the same request returns every row"
        (is (= 100 (count (ui-dataset-rows! (venues-query)))))))))

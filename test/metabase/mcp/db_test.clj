(ns metabase.mcp.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.mcp.db :as mcp.db]
   [metabase.session.query :as session.query]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest get-or-create-core-session-stamps-the-mcp-provider-test
  (testing "MCP-created sessions are stamped with the `mcp` provider so session management can exclude them"
    (mt/with-temp [:model/User {user-id :id} {}]
      (let [key-hashed (str "mcp-test-" (random-uuid))
            session    (mcp.db/get-or-create-core-session! key-hashed user-id)]
        (try
          (is (some? (:auth_identity_id session)))
          (is (= session.query/mcp-provider
                 (t2/select-one-fn :provider :model/AuthIdentity :id (:auth_identity_id session))))
          (testing "a second handshake reuses the same auth identity rather than tripping the unique constraint"
            (let [again (mcp.db/get-or-create-core-session! (str "mcp-test-" (random-uuid)) user-id)]
              (try
                (is (= (:auth_identity_id session) (:auth_identity_id again)))
                (finally
                  (t2/delete! :core_session :id (:id again))))))
          (testing "the stamped session is not live, so it can never be listed or revoked by criteria"
            (is (empty? (t2/query (merge session.query/session-from-and-joins
                                         {:select [[:session.id :id]]
                                          :where  (into [:and [:= :session.user_id user-id]]
                                                        (session.query/live-session-conditions
                                                         (session.query/liveness-params)))})))))
          (finally
            (t2/delete! :core_session :id (:id session))
            (t2/delete! :model/AuthIdentity :user_id user-id :provider session.query/mcp-provider)))))))

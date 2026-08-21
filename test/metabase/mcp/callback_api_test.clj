(ns ^:synchronized metabase.mcp.callback-api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.agent-api.settings :as agent-api.settings]
   [metabase.mcp.session :as mcp.session]
   [metabase.mcp.settings :as mcp.settings]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(def ^:private ask-scopes
  "What an uninstructed MCP client is granted: `metabase.mcp.v2.api/default-ask-scopes` minus the raw-SQL grant."
  #{metabot.scope/agent-content-read
    metabot.scope/agent-query-run
    metabot.scope/agent-resource-read})

(def ^:private sql-scopes
  (conj ask-scopes metabot.scope/agent-sql-run))

(defn- post-drill
  "POST /api/embed-mcp/drills as `user` (default :crowberto), with optional headers
   and an `expected-status` for non-200 cases."
  ([body extra-headers]
   (post-drill :crowberto 200 body extra-headers))
  ([user expected-status body extra-headers]
   (client/client-full-response (test.users/username->token user)
                                :post expected-status "embed-mcp/drills"
                                {:request-options {:headers extra-headers}}
                                body)))

(defn- post-mcp-feedback
  ([user expected-status body session-id]
   (client/client-full-response (test.users/username->token user)
                                :post expected-status "embed-mcp/feedback"
                                {:request-options {:headers {"mcp-session-id" session-id}}}
                                body))
  ([user expected-status body]
   (client/client-full-response (test.users/username->token user)
                                :post expected-status "embed-mcp/feedback"
                                body)))

(defn- post-drill-with-ui-credential
  [expected-status credential session-id]
  (client/client-full-response :post expected-status "embed-mcp/drills"
                               {:request-options {:headers {"x-metabase-mcp-ui-auth" credential
                                                            "mcp-session-id" session-id}}}
                               {:encodedQuery "ZW5jb2RlZA=="}))

(deftest callbacks-are-gated-on-the-mcp-surface-test
  (testing "GHY-4250: with the MCP surface dark there is no iframe to call back from, so the
            callbacks 403 rather than serving handles to nobody"
    (mt/with-temporary-setting-values [mcp.settings/mcp-enabled? false]
      (is (=? {:status 403 :body "MCP server is not enabled."}
              (post-drill :crowberto 403 {:encodedQuery "ZW5jb2RlZA=="} {}))))))

(deftest drills-post-stores-handle-test
  (testing "POST returns a UUID handle"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id nil)
          response   (post-drill {:encodedQuery "ZW5jb2RlZA=="}
                                 {"mcp-session-id" session-id})]
      (is (=? {:status 200
               :body   {:handle parse-uuid}}
              response)))))

(deftest drills-post-validates-session-header-test
  (testing "missing Mcp-Session-Id header returns 400"
    (is (=? {:status 400}
            (post-drill :crowberto 400 {:encodedQuery "ZW5jb2RlZA=="} {}))))
  (testing "non-UUID Mcp-Session-Id returns 404"
    (is (=? {:status 404}
            (post-drill :crowberto 404 {:encodedQuery "ZW5jb2RlZA=="}
                        {"mcp-session-id" "not-a-uuid"}))))
  (testing "session owned by a different user returns 404"
    (let [owner   (mt/user->id :crowberto)
          session (mcp.session/create! owner nil)
          _       (mcp.session/get-or-create-session-key! session owner)]
      (is (=? {:status 404}
              (post-drill :rasta 404 {:encodedQuery "ZW5jb2RlZA=="}
                          {"mcp-session-id" session}))))))

(deftest ui-credential-session-binding-test
  (let [user-id          (mt/user->id :crowberto)
        credential-id    (mcp.session/create! user-id nil)
        other-session-id (mcp.session/create! user-id nil)
        credential       (mcp.session/issue-ui-credential credential-id user-id ask-scopes)]
    (testing "a credential can use the callback surface for its own MCP session"
      (is (= 200 (:status (post-drill-with-ui-credential 200 credential credential-id)))))
    (testing "a credential cannot be reused with another MCP session"
      (is (= 404 (:status (post-drill-with-ui-credential 404 credential other-session-id)))))
    (testing "invalid and expired credentials are rejected"
      (is (= 401 (:status (post-drill-with-ui-credential 401 "not-a-credential" credential-id))))
      (with-redefs [mcp.session/ui-credential-lifetime-seconds -1]
        (is (= 401 (:status (post-drill-with-ui-credential
                             401
                             (mcp.session/issue-ui-credential credential-id user-id ask-scopes)
                             credential-id))))))))

(deftest ui-credential-is-not-a-general-api-credential-test
  (testing "GHY-4250: a UI credential authenticates only the iframe's allowlisted request surface
            (metabase.server.middleware.session/mcp-ui-request-surface), never the wider API —
            possession of one must not amount to a Metabase session"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id nil)
          headers    {"x-metabase-mcp-ui-auth" (mcp.session/issue-ui-credential session-id user-id ask-scopes)}]
      (testing "an allowlisted route authenticates"
        (is (= 200 (:status (client/client-full-response :get 200 "user/current"
                                                         {:request-options {:headers headers}})))))
      (testing "anything outside the allowlist does not"
        (is (= 401 (:status (client/client-full-response :get 401 "collection"
                                                         {:request-options {:headers headers}}))))))))

(deftest drills-post-rejects-blank-body-test
  (testing "blank encodedQuery returns 400"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id nil)]
      (is (=? {:status 400}
              (post-drill :crowberto 400 {:encodedQuery ""}
                          {"mcp-session-id" session-id}))))))

(deftest drills-post-requires-auth-test
  (testing "unauthenticated request returns 401"
    (is (=? {:status 401}
            (client/client-full-response :post 401 "embed-mcp/drills"
                                         {:encodedQuery "ZW5jb2RlZA=="})))))

;;; ------------------------------------------- GET /queries/:handle -----------------------------------------------
;;;
;;; How the v2 MCP Apps tools keep query data out of the model's context: the tool returns only a
;;; handle, and the iframe exchanges it here using the embedding session token it was rendered
;;; with. The (user, session) pair is the access key — the handle alone must not be one.

(defn- get-query
  ([user expected-status handle session-id]
   (client/client-full-response (test.users/username->token user)
                                :get expected-status (str "embed-mcp/queries/" handle)
                                {:request-options {:headers {"mcp-session-id" session-id}}})))

(deftest queries-get-resolves-handle-test
  (testing "GHY-4157: the iframe exchanges a handle for the query and the prompt stored with it"
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [user-id    (mt/user->id :crowberto)
            session-id (mcp.session/create! user-id nil)
            handle     (mcp.session/store-handle! session-id user-id "ZW5jb2RlZA==" "show me orders")]
        (is (=? {:status 200
                 :body   {:query "ZW5jb2RlZA==" :prompt "show me orders"}}
                (get-query :crowberto 200 handle session-id))))))
  (testing "GHY-4157: a handle stored without a prompt resolves with a null prompt, not a 404"
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [user-id    (mt/user->id :crowberto)
            session-id (mcp.session/create! user-id nil)
            handle     (mcp.session/store-handle! session-id user-id "ZW5jb2RlZA==")]
        (is (=? {:status 200
                 :body   {:query "ZW5jb2RlZA==" :prompt nil}}
                (get-query :crowberto 200 handle session-id)))))))

(deftest queries-get-is-user-scoped-test
  (testing "GHY-4157: another user cannot exchange a handle they did not store — it is not a bearer credential"
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [owner      (mt/user->id :crowberto)
            session-id (mcp.session/create! owner nil)
            _          (mcp.session/get-or-create-session-key! session-id owner)
            handle     (mcp.session/store-handle! session-id owner "ZW5jb2RlZA==")]
        (is (=? {:status 404} (get-query :rasta 404 handle session-id)))))))

(deftest queries-get-validates-session-header-test
  (mt/with-model-cleanup [:model/McpQueryHandle]
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id nil)
          handle     (mcp.session/store-handle! session-id user-id "ZW5jb2RlZA==")]
      (testing "GHY-4157: a missing Mcp-Session-Id header is a 400"
        (is (=? {:status 400}
                (client/client-full-response (test.users/username->token :crowberto)
                                             :get 400 (str "embed-mcp/queries/" handle)))))
      (testing "GHY-4157: an unknown handle is a 404"
        (is (=? {:status 404} (get-query :crowberto 404 (str (random-uuid)) session-id))))
      ;; The route's UUID param never matches, so a malformed handle and an unknown one are
      ;; indistinguishable from outside — which is what we want from a lookup endpoint.
      (testing "GHY-4157: a non-UUID handle is a 404, same as an unknown one"
        (is (=? {:status 404} (get-query :crowberto 404 "not-a-uuid" session-id)))))))

(deftest queries-get-requires-auth-test
  (testing "GHY-4157: unauthenticated request returns 401"
    (is (=? {:status 401}
            (client/client-full-response :get 401 (str "embed-mcp/queries/" (random-uuid)))))))

(defn- get-query-with-ui-credential
  [expected-status handle credential session-id]
  (client/client-full-response :get expected-status (str "embed-mcp/queries/" handle)
                               {:request-options {:headers {"x-metabase-mcp-ui-auth" credential
                                                            "mcp-session-id" session-id}}}))

(deftest queries-get-accepts-ui-credential-test
  (testing "the iframe exchanges a handle using only the scoped UI credential it was rendered with —
            no Metabase session cookie is involved, so the credential alone must authenticate this route"
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [user-id    (mt/user->id :crowberto)
            session-id (mcp.session/create! user-id nil)
            credential (mcp.session/issue-ui-credential session-id user-id ask-scopes)
            handle     (mcp.session/store-handle! session-id user-id "ZW5jb2RlZA==" "show me orders")]
        (is (=? {:status 200
                 :body   {:query "ZW5jb2RlZA==" :prompt "show me orders"}}
                (get-query-with-ui-credential 200 handle credential session-id))))))
  (testing "a UI credential minted for one MCP session cannot resolve a handle belonging to another"
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [user-id          (mt/user->id :crowberto)
            credential-id    (mcp.session/create! user-id nil)
            other-session-id (mcp.session/create! user-id nil)
            credential       (mcp.session/issue-ui-credential credential-id user-id ask-scopes)
            handle           (mcp.session/store-handle! other-session-id user-id "ZW5jb2RlZA==")]
        (is (= 404 (:status (get-query-with-ui-credential 404 handle credential other-session-id)))))))
  (testing "an invalid UI credential does not authenticate the handle exchange"
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [user-id    (mt/user->id :crowberto)
            session-id (mcp.session/create! user-id nil)
            handle     (mcp.session/store-handle! session-id user-id "ZW5jb2RlZA==")]
        (is (= 401 (:status (get-query-with-ui-credential 401 handle "not-a-credential" session-id))))))))

(deftest feedback-post-persists-mcp-visualization-feedback-test
  (testing "MCP feedback is persisted to mcp_feedback with the visualization context inline"
    (mt/with-model-cleanup [:model/McpFeedback]
      (let [session-id (mcp.session/create! (mt/user->id :rasta) nil)
            body       {:feedback          {:positive          false
                                            :issue_type        "wrong-visualization"
                                            :freeform_feedback "wrong chart"}
                        :conversation_data {:source "mcp"
                                            :prompt "show orders"
                                            :query  "encoded-query"}}]
        (post-mcp-feedback :rasta 204 body session-id)
        (is (=? {:user_id           (mt/user->id :rasta)
                 :positive          false
                 :issue_type        "wrong-visualization"
                 :freeform_feedback "wrong chart"
                 :prompt            "show orders"
                 :query             "encoded-query"
                 :created_at        some?}
                (t2/select-one :model/McpFeedback :user_id (mt/user->id :rasta)
                               {:order-by [[:id :desc]]})))))))

(deftest feedback-post-persists-minimal-payload-test
  (testing "MCP feedback with only a rating persists a row with the optional fields nil"
    (mt/with-model-cleanup [:model/McpFeedback]
      (let [session-id (mcp.session/create! (mt/user->id :rasta) nil)
            body       {:feedback          {:positive true}
                        :conversation_data {:source "mcp"}}]
        (post-mcp-feedback :rasta 204 body session-id)
        (is (=? {:user_id           (mt/user->id :rasta)
                 :positive          true
                 :issue_type        nil
                 :freeform_feedback nil
                 :prompt            nil
                 :query             nil}
                (t2/select-one :model/McpFeedback :user_id (mt/user->id :rasta)
                               {:order-by [[:id :desc]]})))))))

(deftest feedback-post-requires-metabot-enabled-test
  (testing "MCP feedback returns 403 and persists nothing when no metabot instance is enabled"
    (mt/with-model-cleanup [:model/McpFeedback]
      (mt/with-temporary-setting-values [metabot-enabled? false
                                         embedded-metabot-enabled? false]
        (let [session-id (mcp.session/create! (mt/user->id :rasta) nil)
              body       {:feedback          {:positive true}
                          :conversation_data {:source "mcp"}}]
          (is (=? {:status 403}
                  (post-mcp-feedback :rasta 403 body session-id)))
          (is (zero? (t2/count :model/McpFeedback :user_id (mt/user->id :rasta)))))))))

(deftest feedback-post-rejects-oversized-free-text-test
  (testing "MCP feedback bounds user-controlled free text before persisting"
    (mt/with-model-cleanup [:model/McpFeedback]
      (let [session-id (mcp.session/create! (mt/user->id :rasta) nil)
            too-large  (apply str (repeat 10001 "x"))
            base-body  {:feedback          {:positive true}
                        :conversation_data {:source "mcp"}}]
        (doseq [[path label] [[[:feedback :freeform_feedback] "freeform feedback"]
                              [[:conversation_data :prompt] "prompt"]
                              [[:conversation_data :query] "query"]]]
          (testing label
            (is (=? {:status 400}
                    (post-mcp-feedback :rasta 400 (assoc-in base-body path too-large) session-id)))))
        (is (zero? (t2/count :model/McpFeedback :user_id (mt/user->id :rasta)))
            "Oversized feedback payloads must not be persisted")))))

(deftest feedback-post-validates-session-header-test
  (testing "MCP feedback validates the MCP session header"
    (let [body {:feedback          {:positive true}
                :conversation_data {:source "mcp"
                                    :prompt "show orders"
                                    :query  "encoded-query"}}]
      (is (=? {:status 400}
              (post-mcp-feedback :rasta 400 body)))
      (is (=? {:status 404}
              (post-mcp-feedback :rasta 404 body "not-a-uuid")))
      (let [owner-session (mcp.session/create! (mt/user->id :crowberto) nil)]
        (mcp.session/get-or-create-session-key! owner-session (mt/user->id :crowberto))
        (is (=? {:status 404}
                (post-mcp-feedback :rasta 404 body owner-session)))))))

;;; ------------------------------------- UI credential vs. native SQL (GHY-4318) -------------------------------------

(defn- post-dataset-with-ui-credential
  [expected-status route credential query]
  (client/client-full-response :post expected-status route
                               {:request-options {:headers {"x-metabase-mcp-ui-auth" credential}}}
                               query))

(defn- legacy-native-query []
  {:database (mt/id) :type "native" :native {:query "SELECT 1"}})

(defn- legacy-mbql-query []
  {:database (mt/id) :type "query" :query {:source-table (mt/id :venues) :limit 1}})

(defn- credential-for! [scopes]
  (let [user-id (mt/user->id :crowberto)]
    (mcp.session/issue-ui-credential (mcp.session/create! user-id nil) user-id scopes)))

(deftest ui-credential-native-query-requires-sql-scope-test
  (testing "GHY-4318: the iframe credential is stamped unrestricted so the allowlisted routes stay reachable, which
            left a client granted only the default ask scopes able to lift it out of the resource HTML and POST raw
            SQL to /api/dataset — bypassing agent:sql:run. The credential now carries the minting session's scopes
            and the QP path refuses native SQL that they do not cover."
    (let [native (legacy-native-query)]
      (testing "a credential minted without agent:sql:run is refused, and the message names the missing scope"
        (let [response (post-dataset-with-ui-credential 403 "dataset" (credential-for! ask-scopes) native)]
          (is (= 403 (:status response)))
          (is (str/includes? (str (:body response)) "agent:sql:run"))))
      (testing "the same refusal covers /api/dataset/pivot, the other allowlisted query route"
        (is (= 403 (:status (post-dataset-with-ui-credential 403 "dataset/pivot"
                                                             (credential-for! ask-scopes) native)))))
      (testing "a credential minted WITH agent:sql:run still runs native SQL — this is the execute_sql handle that
                visualize_query is designed to render"
        (is (= 202 (:status (post-dataset-with-ui-credential 202 "dataset"
                                                             (credential-for! sql-scopes) native))))))))

(deftest ui-credential-native-query-honours-kill-switch-test
  (testing "GHY-4318: mcp-execute-sql-enabled is an operator kill switch, so it outranks the granted scope on this
            path just as it does on execute_sql itself"
    (mt/with-temporary-setting-values [agent-api.settings/mcp-execute-sql-enabled false]
      (let [response (post-dataset-with-ui-credential 403 "dataset" (credential-for! sql-scopes)
                                                      (legacy-native-query))]
        (is (= 403 (:status response)))
        (is (str/includes? (str (:body response)) "mcp-execute-sql-enabled"))))))

(deftest ui-credential-mbql-query-is-unaffected-test
  (testing "GHY-4318: rendering an MBQL chart is the iframe's normal path and must not be gated on the SQL scope"
    (let [query (legacy-mbql-query)]
      (is (= 202 (:status (post-dataset-with-ui-credential 202 "dataset" (credential-for! ask-scopes) query))))
      (is (= 202 (:status (post-dataset-with-ui-credential 202 "dataset" (credential-for! sql-scopes) query)))))))

(deftest native-query-without-ui-credential-is-unaffected-test
  (testing "GHY-4318: the gate keys off the MCP UI credential, so an ordinary session request to /api/dataset is
            untouched — the credential's scopes are not a general native-SQL policy"
    (is (=? {:status 202}
            (client/client-full-response (test.users/username->token :crowberto)
                                         :post 202 "dataset" (legacy-native-query))))))

(ns metabase.mcp.models.mcp-query-handle-test
  "Tests for the user-scoped, TTL'd, content-addressed MCP query handle store in
   `metabase.mcp.session`."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.mcp.session :as mcp.session]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(def ^:private sample-query
  {:database 1
   :type     "query"
   :stages   [{:source-table 2}]})

(defn- resolved-query
  "Decode the base64 payload a handle read hands back into the query map it encodes."
  [encoded]
  (some-> encoded u/decode-base64 json/decode+kw))

(deftest round-trip-test
  (testing "a query stored for one user resolves back to the identical query and is invisible to others"
    (let [owner-id   (mt/user->id :crowberto)
          other-id   (mt/user->id :rasta)
          session-id (mcp.session/create! owner-id)
          handle     (mcp.session/store-handle! session-id owner-id (json/encode sample-query))]
      (is (some? (parse-uuid handle)) "store-handle! returns a UUID string")
      (is (= sample-query (resolved-query (mcp.session/read-handle session-id owner-id handle))))
      (is (= sample-query (resolved-query (:encoded_query (mcp.session/resolve-query-handle
                                                           session-id owner-id handle)))))
      (is (nil? (mcp.session/read-handle session-id other-id handle))
          "another user cannot resolve the handle")
      (is (nil? (mcp.session/read-handle session-id owner-id (str (random-uuid))))
          "unknown handles resolve to nil"))))

(deftest stores-plain-json-test
  (testing "the stored payload is plain JSON, not base64"
    (let [owner-id   (mt/user->id :crowberto)
          session-id (mcp.session/create! owner-id)
          handle     (mcp.session/store-handle! session-id owner-id (json/encode sample-query))
          stored     (t2/select-one-fn :encoded_query :model/McpQueryHandle :id handle)]
      (is (= sample-query (json/decode+kw stored))
          "the row holds the JSON verbatim")))
  (testing "storing does not materialize a core_session"
    (let [owner-id   (mt/user->id :crowberto)
          session-id (mcp.session/create! owner-id)
          handle     (mcp.session/store-handle! session-id owner-id (json/encode {:database 9 :stages []}))]
      (is (nil? (t2/select-one-fn :core_session_id :model/McpQueryHandle :id handle))
          "handles no longer hang off a core_session"))))

(deftest content-addressed-test
  (testing "storing the same query twice for the same user yields the same handle and a single row"
    (let [owner-id   (mt/user->id :crowberto)
          session-id (mcp.session/create! owner-id)
          query      (json/encode {:database 3 :stages [{:source-table 42}]})
          h1         (mcp.session/store-handle! session-id owner-id query)
          h2         (mcp.session/store-handle! session-id owner-id query)]
      (is (= h1 h2) "same (user, query) is a stable handle")
      (is (= 1 (t2/count :model/McpQueryHandle :id h1)))))
  (testing "different users storing the same query get distinct handles"
    (let [session-id (mcp.session/create! (mt/user->id :crowberto))
          query      (json/encode {:database 4 :stages [{:source-table 7}]})
          h-crow     (mcp.session/store-handle! session-id (mt/user->id :crowberto) query)
          h-rasta    (mcp.session/store-handle! session-id (mt/user->id :rasta) query)]
      (is (not= h-crow h-rasta)))))

(deftest base64-back-compat-test
  (testing "a pre-migration row whose payload is base64 still resolves"
    (let [owner-id   (mt/user->id :crowberto)
          session-id (mcp.session/create! owner-id)
          handle     (str (random-uuid))
          base64     (u/encode-base64 (json/encode sample-query))]
      (t2/insert! :model/McpQueryHandle
                  {:id             handle
                   :user_id        owner-id
                   :mcp_session_id session-id
                   :encoded_query  base64
                   :expires_at     (t/plus (t/offset-date-time) (t/days 1))})
      (is (= base64 (mcp.session/read-handle session-id owner-id handle))
          "base64 rows pass through unchanged")
      (is (= sample-query (resolved-query (mcp.session/read-handle session-id owner-id handle)))))))

(deftest expiry-test
  (testing "an expired handle does not resolve to the query"
    (let [owner-id   (mt/user->id :crowberto)
          session-id (mcp.session/create! owner-id)
          handle     (str (random-uuid))]
      (t2/insert! :model/McpQueryHandle
                  {:id             handle
                   :user_id        owner-id
                   :mcp_session_id session-id
                   :encoded_query  (json/encode sample-query)
                   :expires_at     (t/minus (t/offset-date-time) (t/days 1))})
      (is (nil? (mcp.session/read-handle session-id owner-id handle)))
      (is (nil? (mcp.session/resolve-query-handle session-id owner-id handle))))))

(deftest cross-session-resolution-test
  (testing "a handle resolves from any session of the same user (the store is user-keyed)"
    (let [owner-id        (mt/user->id :crowberto)
          owner-session   (mcp.session/create! owner-id)
          rotated-session (mcp.session/create! owner-id)
          handle          (mcp.session/store-handle! owner-session owner-id (json/encode sample-query))]
      (is (= sample-query (resolved-query (mcp.session/read-handle rotated-session owner-id handle)))))))

(deftest delete-removes-handles-test
  (testing "delete! removes the session's handles"
    (let [owner-id   (mt/user->id :crowberto)
          session-id (mcp.session/create! owner-id)
          handle     (mcp.session/store-handle! session-id owner-id (json/encode {:database 5 :stages []}))]
      (mcp.session/delete! session-id owner-id)
      (is (nil? (mcp.session/read-handle session-id owner-id handle))))))

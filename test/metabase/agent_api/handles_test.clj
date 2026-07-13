(ns metabase.agent-api.handles-test
  "The user-scoped, TTL'd, content-addressed query handle store."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.agent-api.handles :as handles]
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
    (let [owner-id (mt/user->id :crowberto)
          other-id (mt/user->id :rasta)
          handle   (handles/store-handle! owner-id (json/encode sample-query))]
      (is (some? (parse-uuid handle)) "store-handle! returns a UUID string")
      (is (= sample-query (resolved-query (handles/read-handle owner-id handle))))
      (is (= sample-query (resolved-query (:encoded_query (handles/resolve-query-handle
                                                           owner-id handle)))))
      (is (nil? (handles/read-handle other-id handle))
          "another user cannot resolve the handle")
      (is (nil? (handles/read-handle owner-id (str (random-uuid))))
          "unknown handles resolve to nil"))))

(deftest stores-plain-json-test
  (testing "the stored payload is plain JSON, not base64"
    (let [owner-id (mt/user->id :crowberto)
          handle   (handles/store-handle! owner-id (json/encode sample-query))
          stored   (t2/select-one-fn :encoded_query :model/McpQueryHandle :id handle)]
      (is (= sample-query (json/decode+kw stored))
          "the row holds the JSON verbatim")))
  (testing "a handle hangs off nothing but its owner"
    (let [owner-id (mt/user->id :crowberto)
          handle   (handles/store-handle! owner-id (json/encode {:database 9 :stages []}))
          row      (t2/select-one :model/McpQueryHandle :id handle)]
      (is (= owner-id (:user_id row)))
      (is (nil? (:core_session_id row)))
      (is (nil? (:mcp_session_id row))
          "the stateless transport has no session id to record"))))

(deftest content-addressed-test
  (testing "storing the same query twice for the same user yields the same handle and a single row"
    (let [owner-id (mt/user->id :crowberto)
          query    (json/encode {:database 3 :stages [{:source-table 42}]})
          h1       (handles/store-handle! owner-id query)
          h2       (handles/store-handle! owner-id query)]
      (is (= h1 h2) "same (user, query) is a stable handle")
      (is (= 1 (t2/count :model/McpQueryHandle :id h1)))))
  (testing "different users storing the same query get distinct handles"
    (let [query   (json/encode {:database 4 :stages [{:source-table 7}]})
          h-crow  (handles/store-handle! (mt/user->id :crowberto) query)
          h-rasta (handles/store-handle! (mt/user->id :rasta) query)]
      (is (not= h-crow h-rasta)))))

(deftest base64-back-compat-test
  (testing "a pre-migration row whose payload is base64 still resolves"
    (let [owner-id (mt/user->id :crowberto)
          handle   (str (random-uuid))
          base64   (u/encode-base64 (json/encode sample-query))]
      (t2/insert! :model/McpQueryHandle
                  {:id            handle
                   :user_id       owner-id
                   :encoded_query base64
                   :expires_at    (t/plus (t/offset-date-time) (t/days 1))})
      (is (= base64 (handles/read-handle owner-id handle))
          "base64 rows pass through unchanged")
      (is (= sample-query (resolved-query (handles/read-handle owner-id handle)))))))

(deftest expiry-test
  (testing "an expired handle does not resolve to the query"
    (let [owner-id (mt/user->id :crowberto)
          handle   (str (random-uuid))]
      (t2/insert! :model/McpQueryHandle
                  {:id            handle
                   :user_id       owner-id
                   :encoded_query (json/encode sample-query)
                   :expires_at    (t/minus (t/offset-date-time) (t/days 1))})
      (is (nil? (handles/read-handle owner-id handle)))
      (is (nil? (handles/resolve-query-handle owner-id handle))))))

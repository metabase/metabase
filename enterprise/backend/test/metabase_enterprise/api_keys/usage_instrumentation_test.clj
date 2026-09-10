(ns metabase-enterprise.api-keys.usage-instrumentation-test
  "End-to-end tests for the API-key usage hook in `metabase.server.middleware.log/log-api-call`: real HTTP requests
  through the real middleware and routing stack, asserting the rows that actually land in `api_key_usage_log`.

  The pieces are unit-tested elsewhere (`metabase-enterprise.api-keys.usage-test` for the recorders,
  `metabase.server.middleware.log-test` for the hook, `metabase.api.util.handlers-test` for route-template
  reconstruction). What can only be checked here is that they are wired together — in particular that
  `route_template` survives the trip from the routing tree back up to the log middleware, which sees only the
  pre-routing request."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.api-keys.usage :as ee.usage]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users :web-server))

(defn- rows-for [api-key-id]
  (t2/select :model/ApiKeyUsageLog :api_key_id api-key-id {:order-by [[:id :asc]]}))

(defn- last-used-at [api-key-id]
  (t2/select-one-fn :last_used_at :model/ApiKey :id api-key-id))

(defn- api-key-headers [unmasked-key]
  {:request-options {:headers {"x-api-key" unmasked-key, "user-agent" "metabase-cli/1.2.3"}}})

(defn- do-with-api-key!
  "Create a real API key over the API, run `f` with its unmasked key and id, then clean up the key and its usage rows.
  Rows are inserted from a Grouper queue, so `synchronous-batch-updates` is forced on for the duration — otherwise
  the row would only appear a batch interval later, on another thread."
  [f]
  (mt/with-temporary-setting-values [synchronous-batch-updates true]
    (let [{unmasked-key :unmasked_key, api-key-id :id}
          (mt/user-http-request :crowberto :post 200 "api-key"
                                {:group_id (:id (perms/all-users-group))
                                 :name     (str (random-uuid))})]
      (ee.usage/reset-last-used-throttle!)
      (try
        (f unmasked-key api-key-id)
        (finally
          (t2/delete! :model/ApiKeyUsageLog :api_key_id api-key-id)
          (t2/delete! :model/ApiKey :id api-key-id))))))

(deftest api-key-request-is-recorded-test
  (testing "an API-key-authenticated request to a defendpoint records one row, attributed to the key that made it"
    (do-with-api-key!
     (fn [unmasked-key api-key-id]
       (client/client :get 200 "user/current" (api-key-headers unmasked-key))
       (let [[row :as rows] (rows-for api-key-id)]
         (is (= 1 (count rows)))
         (testing "the route template made it up from the routing tree — this is the whole point of the hook"
           (is (= "/api/user/current" (:route_template row))))
         (is (= api-key-id (:api_key_id row)))
         (is (= (t2/select-one-fn :user_id :model/ApiKey :id api-key-id) (:user_id row)))
         (is (= "GET" (:http_method row)))
         (is (= 200 (:status row)))
         (is (int? (:duration_ms row)))
         (is (= "metabase-cli" (:client_name row)))
         (is (nil? (:tenant_id row)))
         (testing "embedding_client is absent — the common case, no X-Metabase-Client header sent"
           (is (nil? (:embedding_client row)))))
       (testing "and last_used_at is stamped"
         (is (some? (last-used-at api-key-id))))))))

(deftest api-key-request-records-embedding-client-test
  (testing "the X-Metabase-Client header, when present, is recorded alongside client_name"
    (do-with-api-key!
     (fn [unmasked-key api-key-id]
       (client/client :get 200 "user/current"
                      (update (api-key-headers unmasked-key) :request-options
                              update :headers assoc "x-metabase-client" "embedding-sdk-react"))
       (let [[row] (rows-for api-key-id)]
         (is (= "embedding-sdk-react" (:embedding_client row)))
         (testing "client_name stays the User-Agent classification — unaffected by the header"
           (is (= "metabase-cli" (:client_name row)))))))))

(deftest api-key-request-records-the-template-not-the-uri-test
  (testing "a route with a path param records the template, never the concrete id"
    (do-with-api-key!
     (fn [unmasked-key api-key-id]
       ;; also the error path: `check-404` *throws*, so this response is built by `catch-api-exceptions` from the
       ;; exception rather than by the endpoint. The route template still has to survive that.
       (client/client :get 404 "card/99999999" (api-key-headers unmasked-key))
       (let [[row] (rows-for api-key-id)]
         (is (= "/api/card/:id" (:route_template row)))
         (is (= 404 (:status row))))))))

(deftest session-authenticated-requests-are-not-recorded-test
  (testing "requests authenticated any other way record nothing at all"
    (do-with-api-key!
     (fn [_unmasked-key api-key-id]
       (let [rows-before (t2/count :model/ApiKeyUsageLog)]
         (mt/user-http-request :crowberto :get 200 "user/current")
         (is (= rows-before (t2/count :model/ApiKeyUsageLog)))
         (is (empty? (rows-for api-key-id))))))))

(deftest unmatched-route-is-not-recorded-test
  (testing "a request that matches no endpoint has no route template, so the row is dropped rather than written"
    (do-with-api-key!
     (fn [unmasked-key api-key-id]
       (client/client :get 404 "user/current/not-a-real-route" (api-key-headers unmasked-key))
       (is (empty? (rows-for api-key-id)))
       (testing "but the key is still marked as used — the request did authenticate"
         (is (some? (last-used-at api-key-id))))))))

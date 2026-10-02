(ns metabase-enterprise.oauth-client-management.api-test
  "Tests for the `/api/ee/oauth-client-management` endpoints — the admin-facing view of which programs can act as
  this instance's users, and the kill switch for one.

  Every assertion goes through the HTTP API: the list and revoke endpoints here, and the public `/oauth` endpoints
  when what is being asserted is that a revoked client really is cut off."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.oauth-server.test-util :as oauth-server.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.date-2 :as u.date]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(use-fixtures :each (fn [thunk] (mt/with-premium-features #{:session-management} (thunk))))

(defn- now-ms
  "Wall-clock epoch milliseconds, which is how `oauth_access_token.expiry` is stored."
  []
  (inst-ms (java.util.Date.)))

(defn- in-an-hour [] (+ (now-ms) 3600000))

(defn- timestamp?
  "Whether `x` is a timestamp as it reaches a test. The test HTTP client parses a handful of well-known date keys
  into temporal values and leaves every other one as the ISO string it was sent as."
  [x]
  (boolean (or (instance? java.time.temporal.Temporal x)
               (and (string? x) (u.date/parse x)))))

(defn- insert-client!
  "Insert an `oauth_client` row directly and return its `client_id`. Registering through `POST /oauth/register`
  exercises a different concern; what these tests need is a client to list."
  [& {:as overrides}]
  (let [client-id (str (random-uuid))]
    (t2/insert! :model/OAuthClient (merge {:client_id         client-id
                                           :client_name       "Test Client"
                                           :redirect_uris     ["https://example.com/callback"]
                                           :grant_types       ["authorization_code" "refresh_token"]
                                           :response_types    ["code"]
                                           :scopes            ["mb:full"]
                                           :application_type  "web"
                                           :registration_type "dynamic"}
                                          overrides))
    client-id))

(defn- insert-token!
  "Insert an `oauth_access_token` or `oauth_refresh_token` row for `user-id` on `client-id`, live for an hour unless
  `overrides` say otherwise."
  [model client-id user-id & {:as overrides}]
  (t2/insert! model (merge {:token     (str (random-uuid))
                            :client_id client-id
                            :user_id   user-id
                            :scope     ["mb:full"]
                            :expiry    (in-an-hour)}
                           overrides)))

(defn- insert-access-token! [client-id user-id & {:as overrides}]
  (insert-token! :model/OAuthAccessToken client-id user-id overrides))

(defn- insert-refresh-token! [client-id user-id & {:as overrides}]
  (insert-token! :model/OAuthRefreshToken client-id user-id overrides))

(defn- list-clients
  "`GET /api/ee/oauth-client-management` as crowberto. Always pass `ids`, so a client another test left behind cannot
  leak into the assertions."
  [& {:as params}]
  (apply mt/user-http-request :crowberto :get 200 "ee/oauth-client-management" (mapcat identity params)))

(defn- client-ids [response]
  (mapv :client_id (:data response)))

(defmacro ^:private with-clean-clients
  "Run `body`, removing the OAuth rows it created afterwards."
  [& body]
  `(mt/with-model-cleanup [:model/OAuthClient :model/OAuthClientEvent :model/OAuthAccessToken
                           :model/OAuthRefreshToken :model/OAuthAuthorizationCode]
     ~@body))

(deftest api-requires-session-management-feature-test
  (testing "without the feature every endpoint answers 402, whoever is asking"
    (mt/with-premium-features #{}
      (let [message (str "Session management is a paid feature not currently available to your instance. "
                         "Please upgrade to use it. Learn more at metabase.com/upgrade/")]
        (doseq [[method path body] [[:get "ee/oauth-client-management"]
                                    [:post "ee/oauth-client-management/revoke" {:ids []}]]
                user               [:crowberto :rasta]]
          (testing (str method " " path " as " user)
            (is (=? {:message message}
                    (apply mt/user-http-request user method 402 path (when body [body]))))))
        (testing "unauthenticated"
          (is (=? {:message message}
                  (mt/client :get 402 "ee/oauth-client-management"))))))))

(deftest permissions-test
  (testing "both endpoints are superuser-only"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :get 403 "ee/oauth-client-management")))
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :post 403 "ee/oauth-client-management/revoke" {:ids []})))
    (is (map? (mt/user-http-request :crowberto :get 200 "ee/oauth-client-management")))))

(deftest shape-test
  (testing "each item carries the registration an admin needs to judge a client, plus how many live tokens it holds
            and for how many users — and never a hash"
    ;; the users have to outlive the token cleanup: a `core_user` row cannot go while a token still references it
    (mt/with-temp [:model/User {user-a :id} {}
                   :model/User {user-b :id} {}]
      (with-clean-clients
        (let [client-id (insert-client! :client_name                    "Reporting Bot"
                                        :client_uri                     "https://bot.example.com"
                                        :logo_uri                       "https://bot.example.com/logo.png"
                                        :redirect_uris                  ["https://bot.example.com/cb"
                                                                         "http://127.0.0.1:8765/cb"]
                                        :application_type               "native"
                                        :client_secret_hash             "secret-hash-must-not-leak"
                                        :registration_access_token_hash "rat-hash-must-not-leak")]
          (insert-access-token! client-id user-a)
          (insert-access-token! client-id user-a)
          (insert-access-token! client-id user-b)
          ;; neither of these counts: one is revoked, the other has expired
          (insert-access-token! client-id user-b :revoked_at :%now)
          (insert-access-token! client-id user-b :expiry (- (now-ms) 1000))
          (let [item (first (:data (list-clients :ids client-id)))]
            (is (=? {:client_id         client-id
                     :client_name       "Reporting Bot"
                     :client_uri        "https://bot.example.com"
                     :logo_uri          "https://bot.example.com/logo.png"
                     :redirect_uris     ["https://bot.example.com/cb" "http://127.0.0.1:8765/cb"]
                     :application_type  "native"
                     :registration_type "dynamic"
                     :status            "active"
                     :revoked_at        nil
                     :revoked_by        nil
                     :current           false}
                    item))
            (testing "the registration time comes back as a timestamp"
              (is (timestamp? (:created_at item))))
            (testing "only the tokens that still work are counted, and users are counted once each"
              (is (= 3 (:live_tokens item)))
              (is (= 2 (:user_count item))))
            (testing "no hash, secret, scope or contact leaves the database"
              (is (= #{:client_id :client_name :client_uri :logo_uri :redirect_uris :application_type
                       :registration_type :created_at :status :revoked_at :revoked_by :live_tokens
                       :user_count :current}
                     (set (keys item))))
              (is (not (str/includes? (str item) "must-not-leak"))))))))))

(defn- revoke!
  "`POST /api/ee/oauth-client-management/revoke` as crowberto for `ids`."
  [ids & {:keys [expected-status] :or {expected-status 200}}]
  (mt/user-http-request :crowberto :post expected-status "ee/oauth-client-management/revoke" {:ids (vec ids)}))

(deftest status-filter-test
  (testing "the list shows active clients by default, and reaches the revoked ones on request"
    (with-clean-clients
      (let [active  (insert-client! :client_name "Still Here")
            revoked (insert-client! :client_name "Gone")
            both    [active revoked]]
        (revoke! [revoked])
        (testing "the default is active"
          (let [response (list-clients :ids both)]
            (is (= 1 (:total response)))
            (is (= [active] (client-ids response)))))
        (testing "`status=revoked` lists the revoked client with when it went and who revoked it"
          (let [response (list-clients :ids both :status "revoked")]
            (is (= 1 (:total response)))
            (is (= [revoked] (client-ids response)))
            (is (=? {:status     "revoked"
                     :revoked_by {:id          (mt/user->id :crowberto)
                                  :email       "crowberto@metabase.com"
                                  :common_name "Crowberto Corv"}}
                    (first (:data response))))
            (is (timestamp? (:revoked_at (first (:data response)))))))
        (testing "`status=all` lists both"
          (let [response (list-clients :ids both :status "all")]
            (is (= 2 (:total response)))
            (is (= #{active revoked} (set (client-ids response))))))
        (testing "an unrecognized status is rejected"
          (is (=? {:errors {:status string?}}
                  (mt/user-http-request :crowberto :get 400 "ee/oauth-client-management" :status "lapsed"))))))))

(deftest ids-filter-test
  (testing "`ids` narrows the list to an explicit set of client ids, one value or many"
    (with-clean-clients
      (let [a (insert-client!)
            b (insert-client!)
            c (insert-client!)]
        (testing "a single value, which arrives as a bare string rather than an array"
          (is (= [b] (client-ids (list-clients :ids b)))))
        (testing "several"
          (is (= #{a c} (set (client-ids (list-clients :ids [a c]))))))
        (testing "an id nothing matches"
          (let [response (list-clients :ids (str (random-uuid)))]
            (is (= 0 (:total response)))
            (is (= [] (client-ids response)))))))))

(deftest paging-test
  (testing "the list pages, newest registration first, and `total` counts every match rather than the page"
    (with-clean-clients
      ;; created_at is stamped by the model, so register them a second apart to fix the order deterministically
      (let [oldest (insert-client! :client_name "Oldest")
            middle (insert-client! :client_name "Middle")
            newest (insert-client! :client_name "Newest")
            all    [oldest middle newest]]
        (t2/update! :model/OAuthClient {:client_id oldest} {:created_at #t "2026-01-01T00:00:00Z"})
        (t2/update! :model/OAuthClient {:client_id middle} {:created_at #t "2026-02-01T00:00:00Z"})
        (t2/update! :model/OAuthClient {:client_id newest} {:created_at #t "2026-03-01T00:00:00Z"})
        (testing "newest first"
          (is (= [newest middle oldest] (client-ids (list-clients :ids all)))))
        (testing "a page carries the whole total"
          (let [page (list-clients :ids all :limit 2 :offset 0)]
            (is (= 3 (:total page)))
            (is (= 2 (:limit page)))
            (is (= 0 (:offset page)))
            (is (= [newest middle] (client-ids page)))))
        (testing "and the next page is the rest, with nothing shown twice or skipped"
          (is (= [oldest] (client-ids (list-clients :ids all :limit 2 :offset 2)))))))))

(deftest revoke-counts-test
  (testing "a revoke reports the clients it ended, the tokens that went with them, and whose grants those were"
    (mt/with-temp [:model/User {user-a :id} {}
                   :model/User {user-b :id} {}]
      (with-clean-clients
        (let [client-id (insert-client!)
              untouched (insert-client!)]
          (insert-access-token! client-id user-a)
          (insert-refresh-token! client-id user-a)
          (insert-access-token! client-id user-b)
          ;; already revoked, so there is nothing left to stamp
          (insert-access-token! client-id user-b :revoked_at :%now)
          ;; a different client's grant, which this revoke must not touch
          (insert-access-token! untouched user-a)
          (let [response (revoke! [client-id])]
            (is (= 1 (:revoked response)))
            (is (= 3 (:tokens_revoked response)) "two access tokens and one refresh token")
            (is (= #{user-a user-b} (set (:user_ids response))))
            (is (= 0 (:remaining response))))
          (testing "the revoked client is now revoked and holds no live tokens"
            (is (=? {:status "revoked", :live_tokens 0, :user_count 0}
                    (first (:data (list-clients :ids client-id :status "all"))))))
          (testing "and the other client is untouched"
            (is (=? {:status "active", :live_tokens 1, :user_count 1}
                    (first (:data (list-clients :ids untouched)))))))))))

(deftest revoke-is-idempotent-test
  (testing "revoking matches only active clients, so a repeat is a no-op and a mixed batch counts what it matched"
    (with-clean-clients
      (let [a (insert-client!)
            b (insert-client!)
            c (insert-client!)]
        (is (= 1 (:revoked (revoke! [c]))))
        (testing "a repeat of the same ids revokes nothing and still answers 200"
          (is (=? {:revoked 0, :tokens_revoked 0, :user_ids [], :remaining 0} (revoke! [c]))))
        (testing "three ids with one already revoked revokes the other two"
          (is (= 2 (:revoked (revoke! [a b c])))))
        (testing "an unknown id is simply not matched"
          (is (= 0 (:revoked (revoke! [(str (random-uuid))])))))
        (testing "and an empty list revokes nothing"
          (is (= 0 (:revoked (revoke! [])))))))))

(deftest revoke-requires-ids-test
  (testing "`ids` is required: an omitted one must be a 400 rather than a sweep nobody asked for"
    (is (=? {:errors {:ids string?}}
            (mt/user-http-request :crowberto :post 400 "ee/oauth-client-management/revoke" {})))))

(deftest revoke-audit-test
  (testing "a revoke writes one summary row plus one row per client, naming what was revoked and whose grants went"
    (mt/with-additional-premium-features #{:audit-app}
      (mt/with-model-cleanup [:model/AuditLog]
        (mt/with-temp [:model/User {user-id :id} {}]
          (with-clean-clients
            (let [client-id (insert-client! :client_name "Audited Bot")
                  pk        (t2/select-one-pk :model/OAuthClient :client_id client-id)]
              (insert-access-token! client-id user-id)
              (insert-refresh-token! client-id user-id)
              (revoke! [client-id])
              (testing "the summary row carries the criteria and the counts"
                (let [{:keys [topic user_id model model_id details]}
                      (mt/latest-audit-log-entry "oauth-clients-revoked")]
                  (is (= :oauth-clients-revoked topic))
                  (is (= (mt/user->id :crowberto) user_id))
                  (is (nil? model))
                  (is (nil? model_id))
                  (is (= 1 (:count details)))
                  (is (= 2 (:tokens_revoked details)))
                  (is (= 0 (:remaining details)))
                  (is (= [client-id] (get-in details [:criteria :ids])))))
              (testing "the per-client row names the client, so the record survives even if the row is read later"
                (let [{:keys [topic user_id model model_id details]}
                      (mt/latest-audit-log-entry "oauth-client-revoked" pk)]
                  (is (= :oauth-client-revoked topic))
                  (is (= (mt/user->id :crowberto) user_id) "the admin, not the affected user")
                  (is (= "OAuthClient" model))
                  (is (= pk model_id))
                  (is (= client-id (:client_id details)))
                  (is (= "Audited Bot" (:client_name details)))
                  (is (= 2 (:tokens_revoked details)))
                  (is (= [user-id] (:user_ids details))))))))))))

(deftest revoke-logs-without-audit-feature-test
  (testing "the revoke is logged even when the audit log is not being written"
    (with-clean-clients
      (let [client-id (insert-client!)]
        (mt/with-log-messages-for-level [messages [metabase-enterprise.oauth-client-management.api :info]]
          (revoke! [client-id])
          (let [line (some #(when (str/includes? (:message %) "revoked") (:message %)) (messages))]
            (is (some? line) "an info line is written whatever the token allows")
            (is (str/includes? line (format "User %d revoked 1 OAuth client" (mt/user->id :crowberto)))
                "the actor and the count, not just some digits")
            (is (str/includes? line client-id) "and the criteria")))))))

(def ^:private full-access ["mb:full"])

(deftest revoke-through-the-public-flow-test
  (testing "the whole path an admin takes: a client registers itself, a user approves it and it holds a bearer, then
            a revoke closes every door the client had"
    (mt/with-temporary-setting-values [site-url                                  "http://localhost:3000"
                                       oauth-server-dynamic-registration-enabled true]
      (with-clean-clients
        (let [client (oauth-server.tu/register-client! full-access)
              tokens (oauth-server.tu/grant! :rasta client full-access)]
          (testing "the bearer acts as the consenting user"
            (is (= (mt/user->id :rasta)
                   (:id (oauth-server.tu/current-user-with-bearer (:access_token tokens))))))
          (testing "and the admin list shows one live token held by one user"
            (is (=? {:status "active", :live_tokens 1, :user_count 1}
                    (first (:data (list-clients :ids (:client_id client)))))))
          (testing "the revoke reports the client, both its tokens, and the user it cut off"
            (is (=? {:revoked        1
                     :tokens_revoked 2
                     :user_ids       [(mt/user->id :rasta)]
                     :remaining      0}
                    (revoke! [(:client_id client)]))))
          (testing "afterwards the bearer no longer authenticates"
            (oauth-server.tu/current-user-with-bearer (:access_token tokens) :expected-status 401))
          (testing "the client can no longer put a consent page in front of anyone"
            (is (= 400 (:status (oauth-server.tu/consent-page :rasta (:client_id client) full-access)))))
          (testing "nor trade its refresh token for a new bearer"
            (is (= "invalid_request"
                   (:error (oauth-server.tu/refresh! client (:refresh_token tokens) :expected-status 400)))))
          (testing "nor read its own registration"
            (oauth-server.tu/read-registration client :expected-status 401))
          (testing "and the revocation stands on the client's own timeline, carrying the admin"
            (is (=? [{:event_type "revoked", :user_id (mt/user->id :crowberto)}]
                    (:data (mt/user-http-request :crowberto :get 200 "oauth/authorizations"
                                                 :client-id (:client_id client) :event-type "revoked")))))
          (testing "the revoked client stays on record with who revoked it and when"
            (let [item (first (:data (list-clients :ids (:client_id client) :status "revoked")))]
              (is (=? {:status      "revoked"
                       :live_tokens 0
                       :user_count  0
                       :revoked_by  {:id (mt/user->id :crowberto)}}
                      item))
              (is (timestamp? (:revoked_at item))))))))))

(deftest revoke-stamps-expired-tokens-too-test
  (testing "a revoke stamps every token that was not already revoked, so `tokens_revoked` and `user_ids` can be
            non-zero for a client the list shows with no live tokens: the list counts what still works, the revoke
            reports what it stamped"
    (mt/with-temp [:model/User {user-id :id} {}]
      (with-clean-clients
        (let [client-id (insert-client!)]
          (insert-access-token! client-id user-id :expiry (- (now-ms) 1000))
          (insert-refresh-token! client-id user-id :expiry (- (now-ms) 1000))
          (testing "the list shows nothing live, because neither token would authenticate anything"
            (is (=? {:live_tokens 0, :user_count 0} (first (:data (list-clients :ids client-id))))))
          (testing "the revoke still stamps both, and names the user whose grant they were"
            (is (=? {:revoked 1, :tokens_revoked 2, :user_ids [user-id]} (revoke! [client-id])))))))))

(deftest revoke-rejects-too-many-ids-test
  (testing "both endpoints cap how many client ids one request may name, so no caller can blow the database
            driver's bind-parameter limit"
    (let [too-many (repeatedly 1001 #(str (random-uuid)))]
      (is (=? {:errors {:ids string?}}
              (mt/user-http-request :crowberto :post 400 "ee/oauth-client-management/revoke" {:ids too-many})))
      (is (=? {:errors {:ids string?}}
              (apply mt/user-http-request :crowberto :get 400 "ee/oauth-client-management"
                     (mapcat (fn [id] [:ids id]) too-many)))))))

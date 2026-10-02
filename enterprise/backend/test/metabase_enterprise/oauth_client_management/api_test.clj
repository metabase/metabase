(ns metabase-enterprise.oauth-client-management.api-test
  "Tests for the `/api/ee/oauth-client-management` endpoints — the admin-facing view of which programs can act as
  this instance's users, and the kill switch for one.

  Every assertion goes through the HTTP API: the list and revoke endpoints here, and the public `/oauth` endpoints
  when what is being asserted is that a revoked client really is cut off."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing use-fixtures]]
   [java-time.api :as t]
   [metabase.oauth-server.core :as oauth-server]
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
                                    ;; the premium gate is the route table's, so it answers before the lookup and
                                    ;; any id will do
                                    [:get (str "ee/oauth-client-management/" (random-uuid))]
                                    [:post "ee/oauth-client-management/revoke" {:ids []}]]
                user               [:crowberto :rasta]]
          (testing (str method " " path " as " user)
            (is (=? {:message message}
                    (apply mt/user-http-request user method 402 path (when body [body]))))))
        (testing "unauthenticated"
          (is (=? {:message message}
                  (mt/client :get 402 "ee/oauth-client-management"))))))))

(deftest permissions-test
  (testing "every endpoint is superuser-only"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :get 403 "ee/oauth-client-management")))
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :get 403 (str "ee/oauth-client-management/" (random-uuid)))))
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
                     :last_used_at      nil
                     :current           false}
                    item))
            (testing "the registration time comes back as a timestamp"
              (is (timestamp? (:created_at item))))
            (testing "a client that has never presented a token carries no last use, rather than its registration"
              (is (nil? (:last_used_at item))))
            (testing "only the tokens that still work are counted, and users are counted once each"
              (is (= 3 (:live_tokens item)))
              (is (= 2 (:user_count item))))
            (testing "no hash, secret, scope or contact leaves the database"
              (is (= #{:client_id :client_name :client_uri :logo_uri :redirect_uris :application_type
                       :registration_type :created_at :status :revoked_at :revoked_by :last_used_at
                       :live_tokens :user_count :current}
                     (set (keys item))))
              (is (not (str/includes? (str item) "must-not-leak"))))))))))

(defn- revoke-by!
  "`POST /api/ee/oauth-client-management/revoke` as crowberto with `criteria` as the body."
  [criteria & {:keys [expected-status] :or {expected-status 200}}]
  (mt/user-http-request :crowberto :post expected-status "ee/oauth-client-management/revoke" criteria))

(defn- revoke!
  "`POST /api/ee/oauth-client-management/revoke` as crowberto for `ids`."
  [ids & {:as opts}]
  (revoke-by! {:ids (vec ids)} opts))

(defn- revoked?
  "Whether the client with `client-id` reads as revoked through the list."
  [client-id]
  (= "revoked" (:status (first (:data (list-clients :ids client-id :status "all"))))))

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

(deftest query-filter-test
  (testing "`query` is the free-text search an admin runs against an incident report: it looks at the name, the
            `client_id` and the redirect URIs, and every term has to match one of them"
    (with-clean-clients
      (let [reporting (insert-client! :client_name   "Reporting Bot"
                                      :redirect_uris ["https://reports.example.com/cb"])
            invoicing (insert-client! :client_name   "Invoicing Helper"
                                      :redirect_uris ["https://invoices.example.net/callback"
                                                      "http://127.0.0.1:9999/cb"])
            nameless  (insert-client! :client_name   nil
                                      :redirect_uris ["https://anonymous.example.org/cb"])
            all       [reporting invoicing nameless]]
        (testing "a name, case-insensitively and as a substring"
          (is (= [reporting] (client-ids (list-clients :ids all :query "reporting"))))
          (is (= [invoicing] (client-ids (list-clients :ids all :query "VOICING")))))
        (testing "a client id, which is all a dynamically registered client may have"
          (is (= [nameless] (client-ids (list-clients :ids all :query (subs nameless 0 8))))))
        (testing "a redirect URI, by any substring of it"
          (is (= [invoicing] (client-ids (list-clients :ids all :query "127.0.0.1"))))
          (is (= [reporting] (client-ids (list-clients :ids all :query "reports.example.com")))))
        (testing "a term matching none of the three narrows the whole search away, rather than any term matching"
          (let [response (list-clients :ids all :query "invoicing reports.example.com")]
            (is (= 0 (:total response)))
            (is (= [] (client-ids response)))))
        (testing "while terms that match different columns of the same client still match it"
          (is (= [invoicing] (client-ids (list-clients :ids all :query "invoicing 127.0.0.1")))))
        (testing "a match in common to several clients lists them all, and `total` agrees with the rows"
          (let [response (list-clients :ids all :query "example")]
            (is (= 3 (:total response)))
            (is (= 3 (count (:data response))))))
        (testing "a blank query is rejected rather than quietly matching everything"
          (is (=? {:errors {:query string?}}
                  (mt/user-http-request :crowberto :get 400 "ee/oauth-client-management" :query "  "))))))))

(deftest user-id-filter-test
  (testing "`user-id` answers \"what did this person connect?\": the clients they hold an unrevoked token for"
    (mt/with-temp [:model/User {user-a :id} {}
                   :model/User {user-b :id} {}]
      (with-clean-clients
        (let [live-bearer  (insert-client! :client_name "Live Bearer")
              expired-only (insert-client! :client_name "Expired Bearer")
              refresh-only (insert-client! :client_name "Refresh Only")
              revoked-only (insert-client! :client_name "Revoked Grant")
              other-user   (insert-client! :client_name "Someone Else's")
              never-used   (insert-client! :client_name "Never Approved")
              all          [live-bearer expired-only refresh-only revoked-only other-user never-used]]
          (insert-access-token! live-bearer user-a)
          (insert-access-token! expired-only user-a :expiry (- (now-ms) 1000))
          (insert-refresh-token! refresh-only user-a)
          (insert-access-token! revoked-only user-a :revoked_at :%now)
          (insert-access-token! other-user user-b)
          (testing "every client the user still holds a token on, whichever table it is in"
            (is (= #{live-bearer expired-only refresh-only}
                   (set (client-ids (list-clients :ids all :user-id user-a))))))
          (testing "deliberately wider than the Users column, which counts only tokens that still work: an expired
                    bearer is swept nightly but its thirty-day refresh token is what keeps the grant alive, so a
                    client the user connected an hour ago must not vanish from their list"
            (is (=? {:live_tokens 0, :user_count 0}
                    (first (:data (list-clients :ids expired-only))))))
          (testing "a grant that has already been revoked is not one the user holds"
            (is (not (contains? (set (client-ids (list-clients :ids all :user-id user-a))) revoked-only))))
          (testing "and another user sees only their own"
            (is (= [other-user] (client-ids (list-clients :ids all :user-id user-b)))))
          (testing "a user who connected nothing matches nothing"
            (is (= 0 (:total (list-clients :ids all :user-id (mt/user->id :lucky))))))
          (testing "the filter is about what a user holds now, so revoking a client — which stamps every token it
                    held — takes it out of their list rather than keeping it there as history"
            (revoke! [live-bearer])
            (is (= #{expired-only refresh-only}
                   (set (client-ids (list-clients :ids all :user-id user-a :status "all")))))))))))

(deftest combined-filters-test
  (testing "the filters are ANDed, so narrowing by two criteria at once lists only what satisfies both — which is
            how an admin works from an incident report naming a user and a time"
    (mt/with-temp [:model/User {user-a :id} {}
                   :model/User {user-b :id} {}]
      (with-clean-clients
        (let [wanted    (insert-client! :client_name "Reporting Bot")
              wrong-user (insert-client! :client_name "Reporting Bot")
              wrong-name (insert-client! :client_name "Invoicing Helper")
              too-old    (insert-client! :client_name "Reporting Bot")
              all        [wanted wrong-user wrong-name too-old]]
          (doseq [client all]
            (insert-access-token! client (if (= client wrong-user) user-b user-a)))
          (t2/update! :model/OAuthClient {:client_id too-old} {:created_at #t "2026-01-01T00:00:00Z"})
          (testing "`query` and `user-id` together"
            (is (= #{wanted too-old}
                   (set (client-ids (list-clients :ids all :query "reporting" :user-id user-a))))))
          (testing "`query`, `user-id` and `registered-after` together"
            (let [response (list-clients :ids all :query "reporting" :user-id user-a
                                         :registered-after "2026-06-01T00:00:00Z")]
              (is (= [wanted] (client-ids response)))
              (is (= 1 (:total response)) "`total` counts the same intersection the rows do")))
          (testing "a criterion that nothing satisfies narrows the whole list away, even when each one alone matches"
            (is (= 0 (:total (list-clients :ids all :query "invoicing" :user-id user-b)))))
          (testing "and `status` ANDs with the rest rather than replacing them"
            (revoke! [wanted wrong-name])
            (is (= [wanted]
                   (client-ids (list-clients :ids all :query "reporting" :status "revoked"))))))))))

(deftest registered-range-filter-test
  (testing "`registered-before`/`registered-after` is the half-open range an admin reviews recent registrations with"
    (with-clean-clients
      (let [january (insert-client! :client_name "January")
            march   (insert-client! :client_name "March")
            may     (insert-client! :client_name "May")
            all     [january march may]]
        (t2/update! :model/OAuthClient {:client_id january} {:created_at #t "2026-01-15T00:00:00Z"})
        (t2/update! :model/OAuthClient {:client_id march}   {:created_at #t "2026-03-15T00:00:00Z"})
        (t2/update! :model/OAuthClient {:client_id may}     {:created_at #t "2026-05-15T00:00:00Z"})
        (testing "`after` alone"
          (is (= #{march may} (set (client-ids (list-clients :ids all :registered-after "2026-02-01T00:00:00Z"))))))
        (testing "`before` alone"
          (is (= #{january} (set (client-ids (list-clients :ids all :registered-before "2026-02-01T00:00:00Z"))))))
        (testing "both, bounding a window"
          (is (= [march] (client-ids (list-clients :ids all
                                                   :registered-after  "2026-02-01T00:00:00Z"
                                                   :registered-before "2026-04-01T00:00:00Z")))))
        (testing "the range is half-open, so adjacent windows neither overlap nor leave a gap"
          (is (= [march] (client-ids (list-clients :ids all :registered-after "2026-03-15T00:00:00Z"
                                                   :registered-before "2026-05-15T00:00:00Z"))))
          (is (= [] (client-ids (list-clients :ids all :registered-after "2026-03-15T00:00:00Z"
                                              :registered-before "2026-03-15T00:00:00Z")))))
        (testing "an unparseable date is rejected rather than ignored"
          (is (=? {:errors {:registered-after string?}}
                  (mt/user-http-request :crowberto :get 400 "ee/oauth-client-management"
                                        :registered-after "last tuesday"))))))))

(deftest revoked-range-filter-test
  (testing "`revoked-before`/`revoked-after` narrows the record of what was revoked, and only ever matches a revoked
            client — an active one has no `revoked_at` to compare"
    (with-clean-clients
      (let [early  (insert-client! :client_name "Early")
            late   (insert-client! :client_name "Late")
            active (insert-client! :client_name "Still Here")
            all    [early late active]]
        (revoke! [early late])
        (t2/update! :model/OAuthClient {:client_id early} {:revoked_at #t "2026-04-01T00:00:00Z"})
        (t2/update! :model/OAuthClient {:client_id late}  {:revoked_at #t "2026-06-01T00:00:00Z"})
        (testing "a window over the revocations, with the active client never in it"
          (is (= [late] (client-ids (list-clients :ids all :status "all"
                                                  :revoked-after "2026-05-01T00:00:00Z")))))
        (testing "and `before`"
          (is (= [early] (client-ids (list-clients :ids all :status "all"
                                                   :revoked-before "2026-05-01T00:00:00Z")))))
        (testing "the active client is excluded even with no other narrowing, since it carries no revocation time"
          (is (= #{early late}
                 (set (client-ids (list-clients :ids all :status "all"
                                                :revoked-after "2026-01-01T00:00:00Z"))))))))))

(defn- last-used
  "When the client with `client-id` was last used, as the list reports it."
  [client-id]
  (:last_used_at (first (:data (list-clients :ids client-id :status "all")))))

(defn- set-last-used!
  "Backdate `client-id`'s last use, so a later write is visible as a change rather than needing a clock with
  sub-millisecond resolution."
  [client-id instant]
  (t2/update! :model/OAuthClient {:client_id client-id} {:last_used_at instant}))

(def ^:private long-ago #t "2026-01-01T00:00:00Z")

(defn- same-instant?
  "Whether two timestamps name the same moment. The app database and the test client between them decide which
  `java.time` class a column comes back as, and `=` across two of them is false however equal the moments are."
  [a b]
  (and (some? a) (some? b) (= (t/instant a) (t/instant b))))

(deftest last-used-range-filter-test
  (testing "`last-used-before`/`last-used-after` is the half-open range an admin narrows to the clients in use right
            now — or to the dormant ones"
    (with-clean-clients
      (let [recent (insert-client! :client_name "Busy")
            stale  (insert-client! :client_name "Quiet")
            never  (insert-client! :client_name "Never Used")
            all    [recent stale never]]
        (set-last-used! recent #t "2026-06-01T00:00:00Z")
        (set-last-used! stale  #t "2026-04-01T00:00:00Z")
        (testing "`after` alone"
          (is (= [recent] (client-ids (list-clients :ids all :last-used-after "2026-05-01T00:00:00Z")))))
        (testing "`before` alone"
          (is (= [stale] (client-ids (list-clients :ids all :last-used-before "2026-05-01T00:00:00Z")))))
        (testing "both, bounding a window"
          (is (= [stale] (client-ids (list-clients :ids all
                                                   :last-used-after  "2026-03-01T00:00:00Z"
                                                   :last-used-before "2026-05-01T00:00:00Z")))))
        (testing "the range is half-open, so adjacent windows neither overlap nor leave a gap"
          (is (= [recent] (client-ids (list-clients :ids all :last-used-after "2026-06-01T00:00:00Z"))))
          (is (= [] (client-ids (list-clients :ids all :last-used-after "2026-06-01T00:00:00Z"
                                              :last-used-before "2026-06-01T00:00:00Z")))))
        (testing "a client that has never been used is in neither half of the range"
          (is (not (contains? (set (client-ids (list-clients :ids all :last-used-before "2030-01-01T00:00:00Z")))
                              never)))
          (is (not (contains? (set (client-ids (list-clients :ids all :last-used-after "2000-01-01T00:00:00Z")))
                              never))))
        (testing "`total` counts the same clients the rows do"
          (let [response (list-clients :ids all :last-used-after "2026-01-01T00:00:00Z")]
            (is (= 2 (:total response)))
            (is (= 2 (count (:data response))))))
        (testing "an unparseable date is rejected rather than ignored"
          (is (=? {:errors {:last-used-after string?}}
                  (mt/user-http-request :crowberto :get 400 "ee/oauth-client-management"
                                        :last-used-after "whenever"))))))))

(deftest sort-test
  (testing "every offered sort column orders the list, in both directions, so the client an admin is looking for can
            be put at the top"
    (mt/with-temp [:model/User {user-a :id} {}
                   :model/User {user-b :id} {}]
      (with-clean-clients
        (let [alpha (insert-client! :client_name "Alpha")
              beta  (insert-client! :client_name "Beta")
              cedar (insert-client! :client_name "Cedar")
              all   [alpha beta cedar]]
          (t2/update! :model/OAuthClient {:client_id alpha} {:created_at #t "2026-01-01T00:00:00Z"})
          (t2/update! :model/OAuthClient {:client_id beta}  {:created_at #t "2026-02-01T00:00:00Z"})
          (t2/update! :model/OAuthClient {:client_id cedar} {:created_at #t "2026-03-01T00:00:00Z"})
          ;; three live tokens but only one user, against two tokens for two users: whichever column is being sorted
          ;; on, the other one would give a different order, so neither can pass by accident
          (insert-access-token! alpha user-a)
          (insert-access-token! alpha user-a)
          (insert-access-token! alpha user-a)
          (insert-access-token! beta user-a)
          (insert-access-token! beta user-b)
          (testing "`live_tokens 3 2 0` and `user_count 1 2 0`, so the two columns cannot agree by accident"
            (is (=? [{:live_tokens 3, :user_count 1}
                     {:live_tokens 2, :user_count 2}
                     {:live_tokens 0, :user_count 0}]
                    (:data (list-clients :ids all :sort-column "live_tokens" :sort-direction "desc")))))
          (doseq [[column descending] [["created_at"  [cedar beta alpha]]
                                       ["client_name" [cedar beta alpha]]
                                       ["live_tokens" [alpha beta cedar]]
                                       ["user_count"  [beta alpha cedar]]]]
            (testing (str "sorting on " column)
              (is (= descending
                     (client-ids (list-clients :ids all :sort-column column :sort-direction "desc"))))
              (is (= (reverse descending)
                     (client-ids (list-clients :ids all :sort-column column :sort-direction "asc"))))))
          (testing "the default is newest registration first, as before any sort was offered"
            (is (= [cedar beta alpha] (client-ids (list-clients :ids all)))))
          (testing "a column the list cannot sort on is rejected rather than ignored"
            (is (=? {:errors {:sort-column string?}}
                    (mt/user-http-request :crowberto :get 400 "ee/oauth-client-management"
                                          :sort-column "client_secret_hash"))))
          (testing "as is a direction that is neither"
            (is (=? {:errors {:sort-direction string?}}
                    (mt/user-http-request :crowberto :get 400 "ee/oauth-client-management"
                                          :sort-direction "sideways")))))))))

(deftest sort-by-name-puts-a-nameless-client-first-test
  (testing "sorting by name treats a client that registered without one as the empty string, so it leads the
            ascending list rather than landing wherever the app database happens to put nulls"
    (with-clean-clients
      (let [named    (insert-client! :client_name "Aardvark")
            nameless (insert-client! :client_name nil)
            blank    (insert-client! :client_name "")
            pair     [named nameless]]
        (is (= [nameless named]
               (client-ids (list-clients :ids pair :sort-column "client_name" :sort-direction "asc"))))
        (is (= [named nameless]
               (client-ids (list-clients :ids pair :sort-column "client_name" :sort-direction "desc"))))
        (testing "and a client whose name is the empty string sorts with it, the two being indistinguishable"
          (is (= named
                 (last (client-ids (list-clients :ids [named nameless blank]
                                                 :sort-column "client_name" :sort-direction "asc"))))))))))

(deftest sort-by-last-used-test
  (testing "the list sorts on when each client was last used, so the busiest — or the most dormant — comes to the top"
    (with-clean-clients
      (let [recent (insert-client! :client_name "Busy")
            stale  (insert-client! :client_name "Quiet")
            all    [recent stale]]
        (set-last-used! recent #t "2026-06-01T00:00:00Z")
        (set-last-used! stale  #t "2026-04-01T00:00:00Z")
        (is (= [recent stale]
               (client-ids (list-clients :ids all :sort-column "last_used_at" :sort-direction "desc"))))
        (is (= [stale recent]
               (client-ids (list-clients :ids all :sort-column "last_used_at" :sort-direction "asc"))))))))

(deftest sort-by-last-used-falls-back-to-registration-test
  (testing "a client that has never been used sorts by when it registered, so it lands among the clients last seen
            around the same time rather than wherever the app database happens to put nulls"
    (with-clean-clients
      (let [used-recently     (insert-client! :client_name "Used Yesterday")
            registered-today  (insert-client! :client_name "Just Registered")
            used-long-ago     (insert-client! :client_name "Used In April")
            all               [used-recently registered-today used-long-ago]]
        ;; the never-used client registered between the two uses, so the fallback decides where it lands and
        ;; nothing can pass by accident
        (t2/update! :model/OAuthClient {:client_id used-recently}    {:created_at #t "2026-01-01T00:00:00Z"})
        (t2/update! :model/OAuthClient {:client_id used-long-ago}   {:created_at #t "2026-01-01T00:00:00Z"})
        (t2/update! :model/OAuthClient {:client_id registered-today} {:created_at #t "2026-05-01T00:00:00Z"})
        (set-last-used! used-recently #t "2026-06-01T00:00:00Z")
        (set-last-used! used-long-ago #t "2026-04-01T00:00:00Z")
        (is (= [used-recently registered-today used-long-ago]
               (client-ids (list-clients :ids all :sort-column "last_used_at" :sort-direction "desc"))))
        (is (= [used-long-ago registered-today used-recently]
               (client-ids (list-clients :ids all :sort-column "last_used_at" :sort-direction "asc"))))))))

(deftest sort-by-revoked-at-test
  (testing "the Revoked tab sorts on when each client was revoked"
    (with-clean-clients
      (let [early (insert-client! :client_name "Early")
            mid   (insert-client! :client_name "Mid")
            late  (insert-client! :client_name "Late")
            all   [early mid late]]
        (revoke! all)
        (t2/update! :model/OAuthClient {:client_id early} {:revoked_at #t "2026-04-01T00:00:00Z"})
        (t2/update! :model/OAuthClient {:client_id mid}   {:revoked_at #t "2026-05-01T00:00:00Z"})
        (t2/update! :model/OAuthClient {:client_id late}  {:revoked_at #t "2026-06-01T00:00:00Z"})
        (is (= [late mid early]
               (client-ids (list-clients :ids all :status "revoked"
                                         :sort-column "revoked_at" :sort-direction "desc"))))
        (is (= [early mid late]
               (client-ids (list-clients :ids all :status "revoked"
                                         :sort-column "revoked_at" :sort-direction "asc"))))))))

(def ^:private full-access
  "The scope a bearer token needs to reach the general REST API, which is where these tests present one."
  ["mb:full"])

(defn- with-granted-client!
  "Register a client through the public `/oauth/register`, drive the authorization-code flow as `user`, and call `f`
  with its `client_id` and a live access token. Rows are cleaned up afterwards rather than rolled back: a
  rollback-only transaction cannot be held open across the HTTP round-trips the flow makes."
  [user f]
  (mt/with-temporary-setting-values [site-url                                  "http://localhost:3000"
                                     oauth-server-dynamic-registration-enabled true]
    (with-clean-clients
      (let [client (oauth-server.tu/register-client! full-access)
            token  (:access_token (oauth-server.tu/grant! user client full-access))]
        ;; the throttle is node-local and outlives any one test, so a client id another test happened to use must
        ;; not decide whether this one writes
        (oauth-server/clear-client-use-cache!)
        (f (:client_id client) token)))))

(deftest last-used-write-back-test
  (testing "presenting a bearer token records when the client was last used, so an admin can tell a dormant client
            from one in use right now"
    (with-granted-client!
      :rasta
      (fn [client-id token]
        (testing "a client that has registered but never acted carries no last use"
          (is (nil? (last-used client-id))))
        (oauth-server.tu/current-user-with-bearer token)
        (testing "the first bearer request records one"
          (is (timestamp? (last-used client-id))))))))

(deftest last-used-write-back-is-throttled-test
  (testing "the write is throttled, so a client polling an endpoint costs one UPDATE a window rather than one per
            request. That a request after the window writes again is asserted by
            [[metabase.oauth-server.last-use-test/last-used-is-written-again-once-the-window-has-passed-test]], which
            can reach the window itself."
    (with-granted-client!
      :rasta
      (fn [client-id token]
        (oauth-server.tu/current-user-with-bearer token)
        (is (timestamp? (last-used client-id)))
        (testing "a second request inside the window does not write again"
          ;; backdated behind the throttle's back: were the request to write, the column would move off this value
          (set-last-used! client-id long-ago)
          (oauth-server.tu/current-user-with-bearer token)
          (is (same-instant? long-ago (last-used client-id))))))))

(deftest revoked-client-is-never-touched-test
  (testing "a revoked client's tokens never resolve, so nothing it holds can keep its last use moving"
    (with-granted-client!
      :rasta
      (fn [client-id token]
        (oauth-server.tu/current-user-with-bearer token)
        (revoke! [client-id])
        (set-last-used! client-id long-ago)
        (oauth-server/clear-client-use-cache!)
        (oauth-server.tu/current-user-with-bearer token :expected-status 401)
        (is (same-instant? long-ago (last-used client-id)))))))

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

(defn- get-client
  "`GET /api/ee/oauth-client-management/:client-id` as crowberto."
  [client-id & {:keys [expected-status] :or {expected-status 200}}]
  (mt/user-http-request :crowberto :get expected-status (str "ee/oauth-client-management/" client-id)))

(deftest detail-shape-test
  (testing "the detail endpoint answers with the list item plus what the client registered: its scopes and contacts"
    (with-clean-clients
      (let [client-id (insert-client! :client_name                    "Reporting Bot"
                                      :client_uri                     "https://bot.example.com"
                                      :logo_uri                       "https://bot.example.com/logo.png"
                                      :redirect_uris                  ["https://bot.example.com/cb"]
                                      :application_type               "native"
                                      :scopes                         ["mb:full" "agent:question:create"]
                                      :contacts                       ["ops@bot.example.com" "security@bot.example.com"]
                                      :client_secret_hash             "secret-hash-must-not-leak"
                                      :registration_access_token_hash "rat-hash-must-not-leak")
            item      (get-client client-id)]
        (is (=? {:client_id         client-id
                 :client_name       "Reporting Bot"
                 :client_uri        "https://bot.example.com"
                 :logo_uri          "https://bot.example.com/logo.png"
                 :redirect_uris     ["https://bot.example.com/cb"]
                 :application_type  "native"
                 :registration_type "dynamic"
                 :status            "active"
                 :revoked_at        nil
                 :revoked_by        nil
                 :last_used_at      nil
                 :live_tokens       0
                 :user_count        0
                 :current           false
                 :scopes            ["mb:full" "agent:question:create"]
                 :contacts          ["ops@bot.example.com" "security@bot.example.com"]
                 :users             []}
                item))
        (is (timestamp? (:created_at item)))
        (testing "and nothing else — no hash and no secret"
          (is (= #{:client_id :client_name :client_uri :logo_uri :redirect_uris :application_type
                   :registration_type :created_at :status :revoked_at :revoked_by :last_used_at
                   :live_tokens :user_count :current :scopes :contacts :users}
                 (set (keys item))))
          (is (not (str/includes? (str item) "must-not-leak"))))))))

(deftest detail-empty-registration-test
  (testing "a client that sent no contacts and registered no scopes reads as empty lists rather than null"
    (with-clean-clients
      (let [client-id (insert-client! :client_name nil, :client_uri nil, :contacts nil, :scopes [])]
        (is (=? {:client_name nil
                 :client_uri  nil
                 :contacts    []
                 :scopes      []}
                (get-client client-id)))))))

(deftest detail-last-used-test
  (testing "the detail reports when the client was last used, so the sidebar can show it alongside the registration"
    (with-clean-clients
      (let [used  (insert-client! :client_name "Busy")
            never (insert-client! :client_name "Never Used")]
        (set-last-used! used #t "2026-06-01T00:00:00Z")
        (is (same-instant? #t "2026-06-01T00:00:00Z" (:last_used_at (get-client used))))
        (testing "and nothing for one that never has, rather than its registration"
          (is (nil? (:last_used_at (get-client never)))))))))

(deftest detail-unknown-client-test
  (testing "an id nothing is registered under is a 404 rather than an empty client"
    (is (= "Not found."
           (get-client (str (random-uuid)) :expected-status 404)))))

(defn- insert-approval!
  "Record an `approved` event for `client-id` by `user-id` at `at` — the consent the detail view reports as that
  user's last."
  [client-id user-id at]
  (t2/insert! :model/OAuthClientEvent {:oauth_client_id (t2/select-one-pk :model/OAuthClient :client_id client-id)
                                       :user_id         user-id
                                       :event_type      "approved"
                                       :created_at      at}))

(deftest detail-users-test
  (testing "the detail names every user holding a live token, how many each holds, and when they last consented"
    (mt/with-temp [:model/User {ada :id} {:email "ada@example.com", :first_name "Ada", :last_name "Admin"}
                   :model/User {bo :id}  {:email "bo@example.com",  :first_name "Bo",  :last_name "Byte"}
                   :model/User {cy :id}  {:email "cy@example.com"}
                   :model/User {dee :id} {:email "dee@example.com", :first_name "Dee", :last_name "Dash"}]
      (with-clean-clients
        (let [client-id (insert-client!)
              other     (insert-client!)]
          (insert-access-token! client-id ada)
          (insert-access-token! client-id ada)
          (insert-access-token! client-id bo)
          (insert-access-token! client-id dee)
          ;; cy consented once but holds nothing that still works, so a revoke would cut nobody off on their behalf
          (insert-access-token! client-id cy :revoked_at :%now)
          (insert-access-token! client-id cy :expiry (- (now-ms) 1000))
          (insert-approval! client-id cy  #t "2026-08-01T12:00:00Z")
          ;; ada approved twice; the later one is this client's answer for her
          (insert-approval! client-id ada #t "2026-09-01T12:00:00Z")
          (insert-approval! client-id ada #t "2026-09-20T12:00:00Z")
          (insert-approval! client-id bo  #t "2026-09-10T12:00:00Z")
          ;; a different client bo approved later, which must not be read as bo's consent to this one
          (insert-approval! other     bo  #t "2026-09-30T12:00:00Z")
          (let [{:keys [users user_count live_tokens]} (get-client client-id)
                by-email                               (into {} (map (juxt :email identity)) users)]
            (testing "the users are the holders of live tokens, so they are the same ones the counts are over"
              (is (= ["ada@example.com" "bo@example.com" "dee@example.com"] (mapv :email users)))
              (is (= 3 user_count))
              (is (= 4 live_tokens)))
            (testing "each carries who they are and how many tokens of this client's they hold"
              (is (=? [{:id ada, :email "ada@example.com", :common_name "Ada Admin", :live_tokens 2}
                       {:id bo,  :email "bo@example.com",  :common_name "Bo Byte",   :live_tokens 1}
                       {:id dee, :email "dee@example.com", :common_name "Dee Dash",  :live_tokens 1}]
                      users)))
            (testing "the last approval is the client's latest by that user, not their first nor another client's"
              (is (timestamp? (:last_approved_at (by-email "ada@example.com"))))
              (is (pos? (compare (:last_approved_at (by-email "ada@example.com"))
                                 (:last_approved_at (by-email "bo@example.com"))))))
            (testing "and nothing is invented for a user whose token predates any approval on record"
              (is (nil? (:last_approved_at (by-email "dee@example.com")))))))))))

(deftest detail-revoked-client-test
  (testing "a revoked client is still returned, carrying when it went and who revoked it"
    (mt/with-temp [:model/User {user-id :id} {}]
      (with-clean-clients
        (let [client-id (insert-client! :client_name "Gone")]
          (insert-access-token! client-id user-id)
          (insert-approval! client-id user-id #t "2026-09-01T12:00:00Z")
          (revoke! [client-id])
          (let [item (get-client client-id)]
            (is (=? {:client_id   client-id
                     :client_name "Gone"
                     :status      "revoked"
                     :live_tokens 0
                     :user_count  0
                     :revoked_by  {:id          (mt/user->id :crowberto)
                                   :email       "crowberto@metabase.com"
                                   :common_name "Crowberto Corv"}}
                    item))
            (is (timestamp? (:revoked_at item)))
            (testing "and nobody is listed as holding a live token, because the revoke stamped them all"
              (is (= [] (:users item))))))))))

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

(deftest revoke-everything-test
  (testing "an empty body means every active client: the one action for an admin who does not yet know which client
            is the problem"
    (with-clean-clients
      (let [a            (insert-client! :client_name "A")
            b            (insert-client! :client_name "B")
            c            (insert-client! :client_name "C")
            already-gone (insert-client! :client_name "Already Gone")]
        (revoke! [already-gone])
        (let [response (revoke-by! {})]
          (is (<= 3 (:revoked response))
              "at least the three active clients this test registered, and whatever else the instance had")
          (is (= 0 (:remaining response))
              "nothing active still matches, which is the whole point of the sweep"))
        (is (every? revoked? [a b c already-gone]))
        (testing "and a second sweep is a harmless no-op, since nothing active is left to match"
          (is (=? {:revoked 0, :tokens_revoked 0, :user_ids [], :remaining 0} (revoke-by! {}))))))))

(deftest revoke-by-user-id-test
  (testing "`user-id` revokes what one person connected and nothing else — the answer to \"undo what they approved\""
    (mt/with-temp [:model/User {user-a :id} {}
                   :model/User {user-b :id} {}]
      (with-clean-clients
        (let [theirs    (insert-client! :client_name "Theirs")
              also      (insert-client! :client_name "Also Theirs")
              untouched (insert-client! :client_name "Someone Else's")]
          (insert-access-token! theirs user-a)
          (insert-refresh-token! also user-a)
          (insert-access-token! untouched user-b)
          (let [response (revoke-by! {:user-id user-a})]
            (is (= 2 (:revoked response)))
            (is (= 2 (:tokens_revoked response)))
            (is (= [user-a] (:user_ids response)))
            (is (= 0 (:remaining response))))
          (is (revoked? theirs))
          (is (revoked? also))
          (is (not (revoked? untouched))
              "the other user's client keeps working"))))))

(deftest revoke-by-registered-after-test
  (testing "`registered-after` revokes a batch of recent registrations, the shape of cleaning up after an incident"
    (with-clean-clients
      (let [old   (insert-client! :client_name "Long Standing")
            fresh (insert-client! :client_name "Just Appeared")]
        (t2/update! :model/OAuthClient {:client_id old} {:created_at #t "2026-01-01T00:00:00Z"})
        (let [response (revoke-by! {:registered-after "2026-06-01T00:00:00Z"
                                    :ids              [old fresh]})]
          (is (= 1 (:revoked response)))
          (is (= 0 (:remaining response))))
        (is (revoked? fresh))
        (is (not (revoked? old))
            "outside the window, so untouched")))))

(deftest revoke-by-last-used-test
  (testing "`last-used-before` sweeps the dormant clients — \"nothing has used this since the spring, cut it off\" —
            which is the whole reason the column is recorded"
    (with-clean-clients
      (let [dormant (insert-client! :client_name "Forgotten")
            busy    (insert-client! :client_name "Still Working")
            never   (insert-client! :client_name "Never Used")
            all     [dormant busy never]]
        (set-last-used! dormant #t "2026-04-01T00:00:00Z")
        (set-last-used! busy    #t "2026-09-01T00:00:00Z")
        (let [criteria {:last-used-before "2026-06-01T00:00:00Z" :ids all}
              response (revoke-by! criteria)]
          (is (= 1 (:revoked response)))
          (testing "`remaining` recounts with the same criteria, so it reads 0 once the sweep has run"
            (is (= 0 (:remaining response))))
          (is (revoked? dormant))
          (is (not (revoked? busy)) "used since the bound, so untouched")
          (testing "and a client that has never been used is not swept either: it matches neither bound, exactly as
                    it does not for the list"
            (is (not (revoked? never))))
          (testing "repeating the sweep is a no-op, the dormant client being revoked already"
            (is (=? {:revoked 0, :remaining 0} (revoke-by! criteria)))))))))

(deftest revoke-rejects-list-only-criteria-test
  (testing "a criterion that can only match a revoked client, or that searches by substring, is a 400 rather than
            something quietly narrowed — so the list always previews exactly what the same body would revoke"
    (with-clean-clients
      (let [client-id (insert-client!)]
        (doseq [[k v] {:status         "revoked"
                       :revoked-before "2026-06-01T00:00:00Z"
                       :revoked-after  "2026-06-01T00:00:00Z"
                       :query          "anything"}]
          (testing (str k " in the body")
            (is (=? {:errors {k string?}}
                    (revoke-by! {k v} :expected-status 400)))))
        (testing "and sending one of them as null is a 400 too, rather than a sweep of every active client"
          (doseq [k [:status :revoked-before :revoked-after :query]]
            (testing (str k " null in the body")
              (is (=? {:errors {k string?}}
                      (revoke-by! {k nil} :expected-status 400))))))
        (is (not (revoked? client-id))
            "a rejected request revokes nothing")
        (testing "`status active` is accepted, since it is what a revoke means anyway"
          (is (= 1 (:revoked (revoke-by! {:ids [client-id] :status "active"})))))
        (is (revoked? client-id))))))

(deftest revoke-race-test
  (testing "a client that registers between the select and the update is reported as `remaining` rather than
            silently left active — an admin sweeping after an incident has to know the sweep missed something"
    (mt/with-temp [:model/User {user-id :id} {}]
      (with-clean-clients
        (let [matched (insert-client! :client_name "Matched")
              revoke  (mt/original-fn #'oauth-server/revoke-clients!)]
          (insert-access-token! matched user-id)
          (mt/with-dynamic-fn-redefs [oauth-server/revoke-clients!
                                      (fn [client-ids actor-id]
                                        ;; a second client this user holds a token on, so it matches the same
                                        ;; criteria but was not among the ids the select had found
                                        (insert-access-token! (insert-client! :client_name "Raced In") user-id)
                                        (revoke client-ids actor-id))]
            (let [response (revoke-by! {:user-id user-id})]
              (is (= 1 (:revoked response)))
              (is (= 1 (:remaining response))
                  "the client that arrived mid-revoke is still active and still matches"))))))))

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
                  (is (= [client-id] (get-in details [:criteria :ids])))
                  (is (true? (get-in details [:criteria :exclude-current]))
                      "`remaining` is counted with it, so the row has to say whether the current client was spared")))
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

(defn- as-bearer
  "`method path` against the admin API authenticated with `access-token` rather than a session cookie, so the request
  has a current client the way a call from the Metabase CLI does."
  [access-token method expected-status path & args]
  (apply mt/client method expected-status path
         {:request-options {:headers {"authorization" (str "Bearer " access-token)}}}
         args))

(defmacro ^:private with-public-flow-enabled
  "Run `body` with the settings the public `/oauth` flow needs: a site URL to build the endpoints from, and dynamic
  registration on."
  [& body]
  `(mt/with-temporary-setting-values [site-url                                  "http://localhost:3000"
                                      oauth-server-dynamic-registration-enabled true]
     ~@body))

(defn- bearer-for-admin!
  "Register a client through the public flow and have crowberto approve it. Returns its `:client-id` and the
  `:access-token` it issued, so a test can reach the admin API through a bearer the way the Metabase CLI does."
  []
  (let [client (oauth-server.tu/register-client! full-access)]
    {:client-id    (:client_id client)
     :access-token (:access_token (oauth-server.tu/grant! :crowberto client full-access))}))

(deftest current-client-test
  (testing "the list marks the client the caller is acting through, so an admin can see which one to leave alone"
    (with-clean-clients
      (with-public-flow-enabled
        (let [{bearer :access-token, current :client-id} (bearer-for-admin!)
              other                                      (insert-client! :client_name "Some Other Client")]
          (testing "through that client's own bearer token"
            (is (=? [{:client_id current, :current true}]
                    (:data (as-bearer bearer :get 200 "ee/oauth-client-management" :ids current))))
            (is (=? [{:client_id other, :current false}]
                    (:data (as-bearer bearer :get 200 "ee/oauth-client-management" :ids other)))))
          (testing "while a request that came with a session cookie has no current client at all"
            (is (=? [{:client_id current, :current false}]
                    (:data (list-clients :ids current))))))))))

(deftest detail-marks-the-current-client-test
  (testing "the detail marks `current` the same way the list does: both build their item from one presenter, so the
            sidebar cannot disagree with the row it opened on"
    (with-clean-clients
      (with-public-flow-enabled
        (let [{bearer :access-token, current :client-id} (bearer-for-admin!)
              other                                     (insert-client! :client_name "Some Other Client")]
          (is (=? {:client_id current, :current true}
                  (as-bearer bearer :get 200 (str "ee/oauth-client-management/" current))))
          (is (=? {:client_id other, :current false}
                  (as-bearer bearer :get 200 (str "ee/oauth-client-management/" other))))
          (testing "and a request that came with a session cookie has no current client at all"
            (is (=? {:client_id current, :current false} (get-client current)))))))))

(deftest exclude-current-test
  (testing "`exclude-current` is what stops an admin sweeping every client from cutting off the client they are
            sweeping with"
    (with-clean-clients
      (with-public-flow-enabled
        (let [{bearer :access-token, current :client-id} (bearer-for-admin!)
              other                                      (insert-client! :client_name "Collateral")]
          (testing "a sweep through the bearer leaves its own client alone and reports nothing left over"
            (let [response (as-bearer bearer :post 200 "ee/oauth-client-management/revoke" {})]
              (is (<= 1 (:revoked response)))
              (is (= 0 (:remaining response))
                  "the current client is held back from the recount too, or a sweep could never report 0"))
            (is (revoked? other))
            (is (not (revoked? current)))
            (testing "and the bearer still works, which is the point"
              (is (= (mt/user->id :crowberto)
                     (:id (as-bearer bearer :get 200 "user/current"))))))
          (testing "`exclude-current false` revokes it too, and then the bearer stops authenticating"
            (is (= 1 (:revoked (as-bearer bearer :post 200 "ee/oauth-client-management/revoke"
                                          {:exclude-current false}))))
            (is (revoked? current))
            (as-bearer bearer :get 401 "user/current")))))))

(deftest exclude-current-is-a-no-op-with-a-cookie-test
  (testing "a session cookie means there is no current client, so asking to hold one back holds back nothing and the
            sweep takes every active client"
    (with-clean-clients
      (let [a (insert-client! :client_name "A")
            b (insert-client! :client_name "B")
            ;; sent explicitly, since it is the flag under test rather than the default
            response (revoke-by! {:exclude-current true})]
        (is (<= 2 (:revoked response)))
        (is (= 0 (:remaining response))
            "nothing was spared, so nothing active still matches")
        (is (every? revoked? [a b]))))))

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

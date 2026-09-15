(ns metabase-enterprise.session-management.api-test
  "Tests for the `/api/ee/session-management` endpoints."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.session-management.db :as sm.db]
   [metabase.api.macros :as api.macros]
   [metabase.api.open-api :as open-api]
   [metabase.app-db.core :as mdb]
   [metabase.request.core :as request]
   [metabase.session.core :as session]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.honey-sql-2 :as h2x]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(use-fixtures :each (fn [f] (mt/with-premium-features #{:session-management}
                              (f))))

(defn- ago [amount unit]
  (h2x/add-interval-honeysql-form (mdb/db-type) (h2x/current-datetime-honeysql-form (mdb/db-type)) (- amount) unit))

(defn- from-now [amount unit]
  (h2x/add-interval-honeysql-form (mdb/db-type) (h2x/current-datetime-honeysql-form (mdb/db-type)) amount unit))

(defn- insert-session!
  "Insert a `core_session` row directly, bypassing the model hooks so timestamps can be arbitrary (including DB-side)
  expressions. Returns the session id."
  [user-id & {:as extra-cols}]
  (let [id (session/generate-session-id)]
    (t2/insert! (t2/table-name :model/Session)
                (merge {:id         id
                        :key_hashed (session/hash-session-key (str (random-uuid)))
                        :user_id    user-id
                        :created_at :%now}
                       extra-cols))
    id))

(defn- list-sessions
  "`GET /api/ee/session-management` as crowberto, scoped to `user-id` so parallel tests can't leak into the assertions."
  [user-id & {:as params}]
  (apply mt/user-http-request :crowberto :get 200 "ee/session-management"
         (mapcat identity (merge {:user-id user-id} params))))

(defn- ids [response]
  (mapv :id (:data response)))

(deftest api-requires-session-management-feature-test
  (testing "without the feature every endpoint answers 402, whoever is asking"
    (mt/with-premium-features #{}
      (let [message (str "Session management is a paid feature not currently available to your instance. "
                         "Please upgrade to use it. Learn more at metabase.com/upgrade/")]
        (doseq [[method path body] [[:get "ee/session-management"]
                                    [:post "ee/session-management/revoke" {}]]
                user               [:crowberto :rasta]]
          (testing (str method " " path " as " user)
            (is (=? {:message message}
                    (apply mt/user-http-request user method 402 path (when body [body]))))))
        (testing "unauthenticated"
          (is (=? {:message message}
                  (mt/client :get 402 "ee/session-management"))))))))

(deftest permissions-test
  (testing "GET /api/ee/session-management is superuser-only"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :get 403 "ee/session-management")))
    (is (map? (mt/user-http-request :crowberto :get 200 "ee/session-management")))))

(deftest shape-test
  (testing "each item carries the user, device, and expiry columns — and never the session credential"
    (mt/with-temp [:model/User {user-id :id} {:first_name "Sess" :last_name "Ion" :email "sess@ion.test"}]
      (let [session-id (insert-session! user-id)
            ;; device_id is CHAR(36); a shorter value comes back space-padded on H2
            device-id  (str (random-uuid))]
        (t2/insert! :model/LoginHistory {:user_id            user-id
                                         :session_id         session-id
                                         :device_id          device-id
                                         :device_description (str "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                                                                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                                                                  "Chrome/124.0 Safari/537.36")
                                         :ip_address         "127.0.0.1"})
        (let [item (first (:data (list-sessions user-id)))]
          (is (= session-id (:id item)))
          (is (= {:id user-id :email "sess@ion.test" :common_name "Sess Ion"} (:user item)))
          (is (= "normal" (:type item)))
          (is (= "unknown" (:provider item)))
          (is (= device-id (:device_id item)))
          (is (= "127.0.0.1" (:ip_address item)))
          (is (str/includes? (:user_agent item) "Chrome"))
          (testing "device_description is the humanized user agent, not the raw string"
            (is (= (request/describe-user-agent (:user_agent item)) (:device_description item)))
            (is (not= (:user_agent item) (:device_description item))))
          (testing "the hashed session key is never returned"
            (is (not (contains? item :key_hashed)))
            (is (not (contains? item :anti_csrf_token)))))))))

(deftest expired-sessions-are-excluded-test
  (testing "expired rows are absent from both `data` and `total`"
    (mt/with-temp [:model/User {user-id :id} {}]
      (let [live     (insert-session! user-id)
            _hard    (insert-session! user-id :expires_at (ago 1 :second))
            _future  (insert-session! user-id :expires_at (from-now 1 :hour))
            response (list-sessions user-id)]
        (is (= 2 (:total response)))
        (is (= 2 (count (:data response))))
        (is (contains? (set (ids response)) live))))))

(deftest deactivated-user-sessions-are-excluded-test
  (testing "a deactivated user's sessions vanish from the list even though the rows survive"
    (mt/with-temp [:model/User {user-id :id} {:is_active true}]
      (let [session-id (insert-session! user-id)]
        (is (= 1 (:total (list-sessions user-id))))
        ;; the raw table, not `:model/User`: the model's before-update publishes
        ;; `:event/user-credentials-revoked`, whose handler deletes the user's sessions outright (SEC-863). Going
        ;; through the model would leave no row for the liveness predicate to reject, so this test would pass even
        ;; with `[:= :user.is_active true]` deleted from `live-session-conditions`.
        (t2/update! (t2/table-name :model/User) user-id {:is_active false})
        (is (t2/exists? (t2/table-name :model/Session) :id session-id)
            "the session row survives deactivation; it is the predicate that must reject it")
        (let [response (list-sessions user-id)]
          (is (= 0 (:total response)))
          (is (= [] (:data response))))))))

(deftest mcp-sessions-are-never-listed-test
  (testing "an MCP-stamped session is invisible whatever the filters"
    (mt/with-temp [:model/User         {user-id :id} {}
                   :model/AuthIdentity {mcp-id :id}  {:user_id user-id :provider "mcp"}]
      (let [normal (insert-session! user-id)]
        (insert-session! user-id :auth_identity_id mcp-id)
        (is (= [normal] (ids (list-sessions user-id))))
        (is (= 1 (:total (list-sessions user-id))))
        (is (= [normal] (ids (list-sessions user-id :provider "unknown"))))
        (is (= [] (ids (list-sessions user-id :type "full-app-embed"))))))))

(deftest expires-at-test
  (testing "`expires_at` is the earlier of the row's own expiry and the max-session-age cap"
    (mt/with-temp [:model/User {user-id :id} {}]
      (let [_capped (insert-session! user-id)
            item    (first (:data (list-sessions user-id)))
            created (t/instant (u.date/parse (str (:created_at item))))]
        (is (some? (:expires_at item)) "never null")
        (testing "with no hard expiry it is created_at + max-session-age (14 days by default)"
          (is (= (t/plus created (t/minutes 20160))
                 (t/instant (u.date/parse (str (:expires_at item)))))))))))

(deftest expires-at-does-not-move-when-the-session-is-used-test
  (testing "using a session must not push out the reported expiry — it is a hard cap, not the idle window"
    (mt/with-temp [:model/User {user-id :id} {}]
      (insert-session! user-id)
      (let [before (:expires_at (first (:data (list-sessions user-id))))]
        ;; this is what `touch-session!` does on every authenticated request
        (t2/query {:update (t2/table-name :model/Session)
                   :set    {:last_active_at :%now}
                   :where  [:= :user_id user-id]})
        (is (= before (:expires_at (first (:data (list-sessions user-id))))))))))

(deftest filter-by-ids-test
  (testing "`ids` selects an explicit set of sessions, and an empty set selects none"
    (mt/with-temp [:model/User {user-id :id} {}]
      (let [a (insert-session! user-id)
            b (insert-session! user-id)
            c (insert-session! user-id)]
        (is (= 3 (:total (list-sessions user-id))))
        (is (= #{a c} (set (ids (list-sessions user-id :ids [a c])))))
        (is (= 2 (:total (list-sessions user-id :ids [a c]))))
        (is (= #{b} (set (ids (list-sessions user-id :ids [b])))))))))

(deftest filter-by-type-test
  (testing "`type` splits normal sessions from full-app-embed ones by whether they carry an anti-CSRF token"
    (mt/with-temp [:model/User {user-id :id} {}]
      (let [normal (insert-session! user-id)
            embed  (insert-session! user-id :anti_csrf_token "0123456789abcdef0123456789abcdef")]
        (is (= [normal] (ids (list-sessions user-id :type "normal"))))
        (is (= [embed] (ids (list-sessions user-id :type "full-app-embed"))))
        (is (= "full-app-embed" (:type (first (:data (list-sessions user-id :type "full-app-embed"))))))))))

(deftest filter-by-provider-test
  (testing "`provider` filters on the auth identity, with `unknown` for sessions that have none"
    (mt/with-temp [:model/User         {user-id :id} {}
                   :model/AuthIdentity {pw-id :id}   {:user_id user-id :provider "password" :credentials {:plaintext_password "sM28-p4ssw0rd!"}}]
      (let [unknown  (insert-session! user-id)
            password (insert-session! user-id :auth_identity_id pw-id)]
        (is (= [password] (ids (list-sessions user-id :provider "password"))))
        (is (= [unknown] (ids (list-sessions user-id :provider "unknown"))))
        (is (= "password" (:provider (first (:data (list-sessions user-id :provider "password"))))))
        (is (= "unknown" (:provider (first (:data (list-sessions user-id :provider "unknown"))))))
        (testing "`mcp` is not an accepted filter value: those sessions are never listed"
          (is (some? (mt/user-http-request :crowberto :get 400 "ee/session-management" :provider "mcp"))))))))

(deftest filter-by-created-at-test
  (testing "`created-before`/`created-after` bound a half-open range on created_at"
    (mt/with-temp [:model/User {user-id :id} {}]
      (let [old (insert-session! user-id :created_at (ago 3 :day))
            new (insert-session! user-id)]
        (is (= [new] (ids (list-sessions user-id :created-after (str (t/minus (t/offset-date-time) (t/days 1)))))))
        (is (= [old] (ids (list-sessions user-id :created-before (str (t/minus (t/offset-date-time) (t/days 1)))))))))))

(deftest filter-by-last-active-test
  (testing "`last-active-*` filter on COALESCE(last_active_at, created_at), so an untouched session uses created_at"
    (mt/with-temp [:model/User {user-id :id} {}]
      (let [stale  (insert-session! user-id :created_at (ago 3 :day) :last_active_at (ago 3 :day))
            recent (insert-session! user-id :created_at (ago 3 :day) :last_active_at (ago 1 :minute))
            fresh  (insert-session! user-id)
            cutoff (str (t/minus (t/offset-date-time) (t/days 1)))]
        (is (= #{recent fresh} (set (ids (list-sessions user-id :last-active-after cutoff)))))
        (is (= [stale] (ids (list-sessions user-id :last-active-before cutoff))))))))

(deftest sort-test
  (mt/with-temp [:model/User         {user-a :id}  {:email "aaa@sort.test"}
                 :model/User         {user-b :id}  {:email "zzz@sort.test"}
                 :model/AuthIdentity {pw-id :id}   {:user_id user-b :provider "password" :credentials {:plaintext_password "sM28-p4ssw0rd!"}}]
    ;; `older` was created first but touched most recently; `newer` has never been touched, so its
    ;; COALESCE(last_active_at, created_at) is its creation time. That makes the two orderings disagree, which is the
    ;; whole point of the last_active_at case.
    (let [older (insert-session! user-a :created_at (ago 1 :hour) :last_active_at (ago 10 :second))
          newer (insert-session! user-b :created_at (ago 5 :minute) :auth_identity_id pw-id)
          listed (fn [& {:as params}]
                   (mapv :id (:data (apply mt/user-http-request :crowberto :get 200 "ee/session-management"
                                           (mapcat identity (merge {:ids [older newer]} params))))))]
      (testing "created_at desc is the default"
        (is (= [newer older] (listed))))
      (is (= [older newer] (listed :sort-column "created_at" :sort-direction "asc")))
      (testing "last_active_at sorts on the COALESCE, so the older but recently-touched session wins"
        (is (= [older newer] (listed :sort-column "last_active_at" :sort-direction "desc"))))
      (testing "user_email"
        (is (= [older newer] (listed :sort-column "user_email" :sort-direction "asc")))
        (is (= [newer older] (listed :sort-column "user_email" :sort-direction "desc"))))
      (testing "provider sorts on the displayed value, so a null provider orders as \"unknown\" rather than by where
               the app DB happens to put NULLs (first on H2/MySQL, last on Postgres)"
        (is (= {older "unknown" newer "password"}
               (into {} (map (juxt :id :provider))
                     (:data (mt/user-http-request :crowberto :get 200 "ee/session-management" :ids [older newer])))))
        (is (= [newer older] (listed :sort-column "provider" :sort-direction "asc"))
            "\"password\" sorts before \"unknown\"")
        (is (= [older newer] (listed :sort-column "provider" :sort-direction "desc")))))))

(deftest current-test
  (testing "the session the request itself was made with is flagged, and no other"
    (let [crowberto (mt/user->id :crowberto)
          other     (insert-session! crowberto)
          response  (mt/user-http-request :crowberto :get 200 "ee/session-management" :user-id crowberto)
          by-id     (into {} (map (juxt :id :current)) (:data response))]
      (is (false? (get by-id other)))
      (is (= 1 (count (filter true? (vals by-id))))
          "exactly one session is current"))))

(deftest pagination-test
  (testing "limit/offset page the list while `total` stays the unpaged count"
    (mt/with-temp [:model/User {user-id :id} {}]
      (dotimes [i 3]
        (insert-session! user-id :created_at (ago (inc i) :minute)))
      (let [page (mt/user-http-request :crowberto :get 200 "ee/session-management" :user-id user-id :limit 2 :offset 0)]
        (is (= 3 (:total page)))
        (is (= 2 (count (:data page))))
        (is (= 2 (:limit page)))
        (is (= 0 (:offset page))))
      (testing "no limit means every row, per house convention"
        (let [all (list-sessions user-id)]
          (is (= 3 (count (:data all))))
          (is (nil? (:limit all))))))))

(deftest tenancy-test
  ;; Tenants are enterprise-only: :model/Tenant is not on the OSS classpath, so guard the body out of OSS builds
  ;; entirely (with-premium-features only flips the flag, it does not load EE code).
  (mt/when-ee-evailable
   (mt/with-additional-premium-features #{:tenants}
     (mt/with-temporary-setting-values [use-tenants true]
       (mt/with-temp [:model/Tenant {tenant-id :id} {:name "SM28 T1" :slug "sm28-t1"}
                      :model/User   {external :id}  {:tenant_id tenant-id}
                      :model/User   {internal :id}  {}]
         (let [ext-session (insert-session! external)
               int-session (insert-session! internal)
               listed      (fn [& {:as params}]
                             (set (ids (apply mt/user-http-request :crowberto :get 200 "ee/session-management"
                                              (mapcat identity (merge {:ids [ext-session int-session]} params))))))]
           (testing "external-tenant sessions are listed by default"
             (is (= #{ext-session int-session} (listed)))
             (is (= #{ext-session int-session} (listed :tenancy "all"))))
           (testing "tenancy=internal hides them"
             (is (= #{int-session} (listed :tenancy "internal"))))
           (testing "tenancy=external shows only them"
             (is (= #{ext-session} (listed :tenancy "external"))))
           (testing "a session belonging to a deactivated tenant is not live at all"
             (t2/update! :model/Tenant tenant-id {:is_active false})
             (is (= #{int-session} (listed))))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        POST /api/ee/session-management/revoke                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- insert-session-with-key!
  "Insert a `core_session` row for `user-id` the way a login would, returning `[session-id session-key]`. The key is
  the plaintext credential a client sends in the `X-Metabase-Session` header; only its hash is stored."
  [user-id & {:as extra-cols}]
  (let [session-key (session/generate-session-key)
        session-id  (apply insert-session! user-id
                           (mapcat identity (merge {:key_hashed (session/hash-session-key session-key)}
                                                   extra-cols)))]
    [session-id session-key]))

(defn- session-exists? [session-id]
  (t2/exists? (t2/table-name :model/Session) :id session-id))

(deftest revoke-by-criteria-permissions-test
  (testing "POST /api/ee/session-management/revoke is superuser-only"
    (mt/with-temp [:model/User {user-id :id} {}]
      (let [session-id (insert-session! user-id)]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :post 403 "ee/session-management/revoke" {:ids [session-id]})))
        (is (session-exists? session-id)
            "a rejected request revokes nothing")))))

(deftest revoke-everything-test
  (testing "an empty filter map means every live session — except the caller's, which `exclude-current` holds back"
    (mt/with-temp [:model/User {admin-id :id} {:is_superuser true}
                   :model/User {user-id :id}  {}]
      (let [[caller session-key] (insert-session-with-key! admin-id)
            other                (insert-session! user-id)]
        (try
          (let [response (mt/client session-key :post 200 "ee/session-management/revoke" {})]
            (is (zero? (:remaining response))
                "nothing live still matches, so the caller's own session was excluded from the count too")
            (is (<= 2 (:revoked response)))
            (is (contains? (set (:user_ids response)) user-id))
            (is (not (session-exists? other)))
            (is (session-exists? caller)
                "the caller stays logged in"))
          (finally
            ;; the sweep took the cached test-user sessions with it; the next request has to log in again
            (test.users/clear-cached-session-tokens!)))))))

(deftest revoke-including-current-test
  (testing "`exclude-current` false revokes the caller's own session too, and clears their session cookie"
    (mt/with-temp [:model/User {admin-id :id} {:is_superuser true}]
      (let [[caller session-key] (insert-session-with-key! admin-id)
            response             (mt/client-full-response session-key :post 200 "ee/session-management/revoke"
                                                          {:user-id admin-id :exclude-current false})
            cookies              (str/join " " (u/one-or-many (get-in response [:headers "Set-Cookie"])))]
        (is (= 1 (:revoked (:body response))))
        (is (zero? (:remaining (:body response))))
        (is (not (session-exists? caller)))
        (is (str/includes? cookies "metabase.SESSION=;")
            "the session cookie is cleared, as it is on logout")))))

(deftest revoke-by-ids-test
  (testing "`ids` revokes exactly those sessions; one that is no longer live is left for the cleanup task"
    (mt/with-temp [:model/User {user-id :id} {}]
      (let [live-a    (insert-session! user-id)
            live-b    (insert-session! user-id)
            expired   (insert-session! user-id :expires_at (ago 1 :second))
            untouched (insert-session! user-id)
            response  (mt/user-http-request :crowberto :post 200 "ee/session-management/revoke"
                                            {:ids [live-a live-b expired]})]
        (is (= 2 (:revoked response)))
        (is (zero? (:remaining response)))
        (is (= [user-id] (:user_ids response)))
        (is (not (session-exists? live-a)))
        (is (not (session-exists? live-b)))
        (is (session-exists? expired)
            "an expired row is not live, so the revoke leaves it to the nightly sweep")
        (is (session-exists? untouched)
            "a live session outside the id list is untouched")))))

(deftest revoke-by-ids-and-provider-test
  (testing "every criterion has to hold: `ids` narrows to a set, `provider` narrows within it"
    (mt/with-temp [:model/User         {user-id :id} {}
                   :model/AuthIdentity {saml-id :id} {:user_id user-id :provider "saml"}
                   :model/AuthIdentity {pw-id :id}   {:user_id     user-id :provider "password"
                                                      :credentials {:plaintext_password "sM30-p4ssw0rd!"}}]
      (let [saml-in  (insert-session! user-id :auth_identity_id saml-id)
            saml-out (insert-session! user-id :auth_identity_id saml-id)
            password (insert-session! user-id :auth_identity_id pw-id)
            response (mt/user-http-request :crowberto :post 200 "ee/session-management/revoke"
                                           {:ids [saml-in password] :provider "saml"})]
        (is (= 1 (:revoked response)))
        (is (not (session-exists? saml-in)))
        (is (session-exists? password)
            "in the id list, but not a SAML session")
        (is (session-exists? saml-out)
            "a SAML session, but not in the id list")))))

(deftest revoke-batches-the-delete-test
  (testing "a revoke bigger than one statement can name is still revoked in full, and counted in full"
    (mt/with-temp [:model/User {user-id :id} {}]
      (let [session-ids (vec (repeatedly 5 #(insert-session! user-id)))]
        ;; a real revoke batches at 1000 ids because every id is a bind parameter; two and a half batches of two
        ;; exercises the same code, including the short final batch, without inserting thousands of rows
        (with-bindings {#'sm.db/*delete-batch-size* 2}
          (let [response (mt/user-http-request :crowberto :post 200 "ee/session-management/revoke" {:user-id user-id})]
            (is (= 5 (:revoked response))
                "every batch is counted, not just the last one")
            (is (zero? (:remaining response)))
            (is (not-any? session-exists? session-ids)
                "including the rows in the short final batch")))))))

(deftest revoke-race-test
  (testing "a login that lands between the select and the delete is reported as `remaining`, not silently revoked"
    (mt/with-temp [:model/User {user-id :id} {}]
      (let [_matched (insert-session! user-id)
            raced    (atom nil)
            delete!  (mt/original-fn #'sm.db/delete-sessions-by-ids!)]
        (mt/with-dynamic-fn-redefs [sm.db/delete-sessions-by-ids! (fn [ids]
                                                                    (reset! raced (insert-session! user-id))
                                                                    (delete! ids))]
          (let [response (mt/user-http-request :crowberto :post 200 "ee/session-management/revoke" {:user-id user-id})]
            (is (= 1 (:revoked response)))
            (is (= 1 (:remaining response))
                "the session created after the select is still live and still matches")
            (is (session-exists? @raced)
                "and it was not revoked")))))))

(deftest revoke-audit-test
  (testing "a revoke writes one summary row plus one row per affected user, and never touches an MCP session"
    (mt/with-additional-premium-features #{:audit-app}
      (mt/with-model-cleanup [:model/AuditLog]
        (mt/with-temp [:model/User         {user-a :id} {}
                       :model/User         {user-b :id} {}
                       :model/AuthIdentity {mcp-id :id} {:user_id user-a :provider "mcp"}]
          (let [a1       (insert-session! user-a)
                a2       (insert-session! user-a)
                b1       (insert-session! user-b)
                mcp      (insert-session! user-a :auth_identity_id mcp-id)
                response (mt/user-http-request :crowberto :post 200 "ee/session-management/revoke"
                                               {:ids [a1 a2 b1 mcp]})]
            (is (= 3 (:revoked response)))
            (is (= #{user-a user-b} (set (:user_ids response))))
            (is (session-exists? mcp)
                "an MCP-backed session is never live, so it is never matched")
            (testing "the summary row carries the criteria, the count, and what is left"
              (let [{:keys [topic user_id model model_id details]} (mt/latest-audit-log-entry "sessions-revoked")]
                (is (= :sessions-revoked topic))
                (is (= (mt/user->id :crowberto) user_id))
                (is (nil? model))
                (is (nil? model_id))
                (is (= 3 (:count details)))
                (is (= 0 (:remaining details)))
                (is (= #{a1 a2 b1 mcp} (set (get-in details [:criteria :ids]))))
                (testing "and never a session key or its hash"
                  (is (not (str/includes? (str details) "key_hashed"))))))
            (testing "one row per affected user, naming that user"
              (doseq [[user-id revoked] {user-a 2, user-b 1}]
                (let [{:keys [topic user_id model model_id details]}
                      (mt/latest-audit-log-entry "session-revoked" user-id)]
                  (is (= :session-revoked topic))
                  (is (= (mt/user->id :crowberto) user_id) "the actor, not the affected user")
                  (is (= "User" model))
                  (is (= user-id model_id))
                  (is (= revoked (:count details))))))))))))

(deftest revoke-logs-without-audit-feature-test
  (testing "the revoke is logged even when the audit log is not being written"
    (mt/with-premium-features #{:session-management}
      (mt/with-temp [:model/User {user-id :id} {}]
        (let [session-id (insert-session! user-id)]
          (mt/with-log-messages-for-level [messages [metabase-enterprise.session-management.api :info]]
            (mt/user-http-request :crowberto :post 200 "ee/session-management/revoke" {:ids [session-id]})
            (let [line   (some #(when (str/includes? (:message %) "revoked") (:message %)) (messages))
                  hashes (t2/select-fn-set :key_hashed (t2/table-name :model/Session)
                                           :user_id (mt/user->id :crowberto))]
              (is (some? line) "an info line is written whatever the token allows")
              (is (str/includes? line (format "User %d revoked 1 session" (mt/user->id :crowberto)))
                  "the actor and the count, not just some digits")
              (is (str/includes? line session-id) "the criteria")
              (testing "and never the hash of a live session key"
                (is (seq hashes) "sanity check: crowberto has a session whose hash could have leaked")
                (is (not-any? #(str/includes? line %) hashes))))))))))

;; The endpoint has to return a Ring response to set cookie headers, and must not let that transport detail become
;; the documented response body.
(deftest ^:parallel revoke-openapi-response-test
  (let [paths  (:paths (open-api/open-api-spec (api.macros/ns-handler 'metabase-enterprise.session-management.api) "/api/ee/session-management"))
        schema (fn [path method]
                 (get-in paths [path method :responses "2XX" :content "application/json" :schema]))]
    (testing "POST /revoke documents the result map, not the cookie-clearing alternative alongside it"
      (is (= {:$ref "#/components/schemas/metabase-enterprise.session-management.api.RevokeByCriteriaResult"}
             (schema "/api/ee/session-management/revoke" :post))))))

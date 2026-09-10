(ns metabase-enterprise.session-management.api-test
  "Tests for the `/api/ee/session-management` endpoints."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.app-db.core :as mdb]
   [metabase.request.core :as request]
   [metabase.session.core :as session]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
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
        (doseq [[method path body] [[:get "ee/session-management"]]
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

(ns metabase-enterprise.permission-debug.preview-session-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.permissions.core :as perms]
   [metabase.session.core :as session]
   [metabase.session.models.session :as models.session]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fn [thunk]
                      (mt/with-premium-features #{:advanced-permissions}
                        (thunk))))

(def ^:private preview-header "x-metabase-preview-token")

(defn- insert-session!
  "Insert a login session of the user `user-id` and return its key."
  ([user-id]
   (insert-session! user-id nil))
  ([user-id extra-columns]
   (let [session-key (session/generate-session-key)]
     (t2/insert! :model/Session (merge {:id         (session/generate-session-id)
                                        :key_hashed (session/hash-session-key session-key)
                                        :user_id    user-id}
                                       extra-columns))
     session-key)))

(defn- start-preview!
  "Start a preview as the user `user-id` from the admin session `admin-session-key`, and return the response."
  [admin-session-key user-id]
  (client/client admin-session-key :post 200 "ee/permission_debug/preview/session" {:user_id user-id}))

(defn- as-preview
  "Call `endpoint` with the preview `token` and no other credential, expecting `status`."
  [token method status endpoint & args]
  (apply client/client method status endpoint {:request-options {:headers {preview-header token}}} args))

(defn- insert-admin-session!
  "Insert a login session of the admin and return its key."
  []
  (insert-session! (mt/user->id :crowberto)))

(deftest start-preview-test
  (let [admin-session-key             (insert-admin-session!)
        session-rows-before           (t2/count :model/Session)
        {:keys [id token expires_at user_id]} (start-preview! admin-session-key (mt/user->id :rasta))]
    (testing "the response carries the preview's id, its token, its expiry and the person it runs as"
      (is (pos-int? id))
      (is (= (mt/user->id :rasta) user_id))
      (is (re-matches #"mbpv_[0-9a-f-]{36}" token))
      (is (some? expires_at)))
    (testing "the preview is stored by the token's hash, with the person, the admin and the admin's session"
      (let [row (t2/select-one :model/PermissionPreviewSession :id id)]
        (is (= {:user_id          (mt/user->id :rasta)
                :admin_user_id    (mt/user->id :crowberto)
                :token_hash       (session/hash-session-key token)
                :admin_session_id (t2/select-one-fn :id :model/Session
                                                    :key_hashed (session/hash-session-key admin-session-key))}
               (select-keys row [:user_id :admin_user_id :token_hash :admin_session_id])))
        (is (not= token (:token_hash row)))))
    (testing "no session row is written"
      (is (= session-rows-before (t2/count :model/Session))))))

(deftest start-preview-refusals-test
  (let [admin-session-key (insert-admin-session!)]
    (testing "a non-admin can't start a preview"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 "ee/permission_debug/preview/session"
                                   {:user_id (mt/user->id :lucky)}))))
    (testing "an admin can't be previewed"
      (is (= "preview-target-admin"
             (:error-code (client/client admin-session-key :post 400 "ee/permission_debug/preview/session"
                                         {:user_id (mt/user->id :crowberto)})))))
    (testing "another admin can't be previewed"
      (mt/with-temp [:model/User {user-id :id} {:is_superuser true}]
        (is (= "preview-target-admin"
               (:error-code (client/client admin-session-key :post 400 "ee/permission_debug/preview/session"
                                           {:user_id user-id}))))))
    (testing "a deactivated user can't be previewed"
      (mt/with-temp [:model/User {user-id :id} {:is_active false}]
        (is (= "preview-target-deactivated"
               (:error-code (client/client admin-session-key :post 400 "ee/permission_debug/preview/session"
                                           {:user_id user-id}))))))
    (testing "the internal user, who isn't a person, can't be previewed"
      (is (= "preview-target-not-a-person"
             (:error-code (client/client admin-session-key :post 400 "ee/permission_debug/preview/session"
                                         {:user_id (t2/select-one-pk :model/User :type :internal)})))))
    (testing "a tenant user can't be previewed while tenants are off"
      (mt/with-temp [:model/Tenant {tenant-id :id} {:name "Preview tenant" :slug "preview-tenant"}
                     :model/User {user-id :id} {:tenant_id tenant-id}]
        (is (= "preview-target-tenant-unavailable"
               (:error-code (client/client admin-session-key :post 400 "ee/permission_debug/preview/session"
                                           {:user_id user-id}))))))
    (testing "a user that doesn't exist is a 404"
      (client/client admin-session-key :post 404 "ee/permission_debug/preview/session" {:user_id Integer/MAX_VALUE}))))

(deftest start-preview-needs-a-browser-session-test
  (testing "an API key of an admin can't start a preview"
    (let [{api-key :unmasked_key} (mt/user-http-request :crowberto :post 200 "api-key"
                                                        {:group_id (:id (perms/admin-group))
                                                         :name     (str (random-uuid))})]
      (is (= "preview-requires-browser-session"
             (:error-code (client/client :post 403 "ee/permission_debug/preview/session"
                                         {:request-options {:headers {"x-api-key" api-key}}}
                                         {:user_id (mt/user->id :rasta)}))))))
  (testing "a full-app embedding session of an admin can't start a preview"
    (let [anti-csrf-token (apply str (repeat 32 "a"))
          session-key     (insert-session! (mt/user->id :crowberto) {:anti_csrf_token anti-csrf-token})]
      (is (= "preview-requires-browser-session"
             (:error-code (client/client :post 403 "ee/permission_debug/preview/session"
                                         {:request-options {:headers {"cookie"                  (str "metabase.EMBEDDED_SESSION=" session-key)
                                                                      "x-metabase-anti-csrf-token" anti-csrf-token}}}
                                         {:user_id (mt/user->id :rasta)}))))))
  (testing "a preview's own token can't start another preview"
    (let [{:keys [token]} (start-preview! (insert-admin-session!) (mt/user->id :rasta))]
      (is (= "preview-read-only"
             (:error-code (as-preview token :post 403 "ee/permission_debug/preview/session"
                                      {:user_id (mt/user->id :lucky)})))))))

(deftest running-as-the-person-test
  (let [admin-session-key (insert-admin-session!)
        {:keys [token]}   (start-preview! admin-session-key (mt/user->id :rasta))]
    (testing "a request with the token runs as the person"
      (is (= "rasta@metabase.com"
             (:email (as-preview token :get 200 "user/current"))))
      (is (false? (:is_superuser (as-preview token :get 200 "user/current")))))
    (testing "the token wins over the admin's own session on the same request"
      (is (= "rasta@metabase.com"
             (:email (client/client admin-session-key :get 200 "user/current"
                                    {:request-options {:headers {preview-header token}}})))))
    (testing "without the token, the admin is still the admin"
      (is (= "crowberto@metabase.com"
             (:email (client/client admin-session-key :get 200 "user/current")))))))

(deftest bad-token-is-refused-test
  (let [admin-session-key (insert-admin-session!)]
    (testing "an unknown token is refused, even with the admin's session on the request"
      (is (= "preview-token-invalid"
             (:error-code (client/client admin-session-key :get 401 "user/current"
                                         {:request-options {:headers {preview-header "mbpv_00000000-0000-0000-0000-000000000000"}}})))))
    (testing "a header with an empty value is refused, even with the admin's session on the request"
      (is (= "preview-token-invalid"
             (:error-code (client/client admin-session-key :get 401 "user/current"
                                         {:request-options {:headers {preview-header ""}}})))))
    (testing "a value that isn't a preview token is refused, even with the admin's session on the request"
      (is (= "preview-token-invalid"
             (:error-code (client/client admin-session-key :get 401 "user/current"
                                         {:request-options {:headers {preview-header admin-session-key}}})))))))

(deftest preview-is-read-only-test
  (let [{:keys [token]} (start-preview! (insert-admin-session!) (mt/user->id :rasta))]
    (testing "a write gets 403 preview-read-only, whatever the method"
      (doseq [[method endpoint body] [[:post "card" {:name "x"}]
                                      [:put (str "user/" (mt/user->id :rasta)) {:first_name "x"}]
                                      [:delete (str "user/" (mt/user->id :lucky)) nil]]]
        (is (= "preview-read-only"
               (:error-code (if body
                              (as-preview token method 403 endpoint body)
                              (as-preview token method 403 endpoint)))))))
    (testing "nothing was written"
      (is (not (t2/exists? :model/Card :name "x")))
      (is (not= "x" (t2/select-one-fn :first_name :model/User :id (mt/user->id :rasta)))))
    (testing "a POST that only reads passes, and runs as the person"
      (is (= [[1]]
             (mt/rows (as-preview token :post 202 "dataset"
                                  {:database (mt/id)
                                   :type     :query
                                   :query    {:source-table (mt/id :venues)
                                              :aggregation  [[:count]]
                                              :filter       [:= [:field (mt/id :venues :id) nil] 1]}})))))))

(deftest ended-admin-session-voids-the-preview-test
  (let [admin-session-key (insert-admin-session!)
        {:keys [token]}   (start-preview! admin-session-key (mt/user->id :rasta))]
    (is (= "rasta@metabase.com" (:email (as-preview token :get 200 "user/current"))))
    (models.session/end-session-for-key! (session/hash-session-key admin-session-key) "logout" :self)
    (testing "once the admin's session has ended, the token is refused"
      (is (= "preview-token-invalid"
             (:error-code (as-preview token :get 401 "user/current")))))))

(deftest deactivated-person-voids-the-preview-test
  (mt/with-temp [:model/User {user-id :id} {}]
    (let [{:keys [token]} (start-preview! (insert-admin-session!) user-id)]
      (t2/update! :model/User :id user-id {:is_active false})
      (is (= "preview-token-invalid"
             (:error-code (as-preview token :get 401 "user/current")))))))

(defn- expiry-minutes-from-now [preview-id]
  (t/time-between (t/offset-date-time)
                  (t/offset-date-time (t2/select-one-fn :expires_at :model/PermissionPreviewSession :id preview-id))
                  :minutes))

(defn- set-expiry-in-minutes! [preview-id minutes]
  (t2/update! :model/PermissionPreviewSession :id preview-id
              {:expires_at (t/plus (t/offset-date-time) (t/minutes minutes))}))

(deftest expiry-test
  (let [{:keys [id token]} (start-preview! (insert-admin-session!) (mt/user->id :rasta))]
    (testing "a preview lasts 30 minutes"
      (is (<= 29 (expiry-minutes-from-now id) 30)))
    (testing "a request with 25 minutes left doesn't renew it"
      (set-expiry-in-minutes! id 25)
      (as-preview token :get 200 "user/current")
      (is (<= 24 (expiry-minutes-from-now id) 25)))
    (testing "a request with 15 minutes left renews it to 30"
      (set-expiry-in-minutes! id 15)
      (as-preview token :get 200 "user/current")
      (is (<= 29 (expiry-minutes-from-now id) 30)))
    (testing "an expired preview is refused"
      (set-expiry-in-minutes! id -1)
      (is (= "preview-token-invalid"
             (:error-code (as-preview token :get 401 "user/current")))))))

(deftest end-preview-test
  (let [admin-session-key  (insert-admin-session!)
        {:keys [id token]} (start-preview! admin-session-key (mt/user->id :rasta))]
    (testing "a non-admin can't end a preview"
      (mt/user-http-request :rasta :delete 403 (str "ee/permission_debug/preview/session/" id)))
    (testing "the admin ends it, and the token is refused afterwards"
      (client/client admin-session-key :delete 204 (str "ee/permission_debug/preview/session/" id))
      (is (not (t2/exists? :model/PermissionPreviewSession :id id)))
      (is (= "preview-token-invalid"
             (:error-code (as-preview token :get 401 "user/current")))))
    (testing "a preview that is gone is a 404"
      (client/client admin-session-key :delete 404 (str "ee/permission_debug/preview/session/" id)))))

(deftest only-the-starting-admin-ends-a-preview-test
  (mt/with-temp [:model/User {other-admin-id :id} {:is_superuser true}]
    (let [{:keys [id]}      (start-preview! (insert-admin-session!) (mt/user->id :rasta))
          other-session-key (insert-session! other-admin-id)]
      (client/client other-session-key :delete 404 (str "ee/permission_debug/preview/session/" id))
      (is (t2/exists? :model/PermissionPreviewSession :id id)))))

(deftest token-is-not-a-session-key-test
  (let [{:keys [token]} (start-preview! (insert-admin-session!) (mt/user->id :rasta))]
    (testing "the token sent as a session key doesn't authenticate"
      (is (= "Unauthenticated"
             (client/client token :get 401 "user/current"))))))

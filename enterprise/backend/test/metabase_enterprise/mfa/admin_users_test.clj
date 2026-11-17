(ns metabase-enterprise.mfa.admin-users-test
  "Tests for the admin enrolled/unenrolled user lists. These run against a shared app DB that other
  tests populate, so assertions are on membership of `:data` by id — never on an absolute `:total`.
  The one exception is [[counts-match-lists-test]], where comparing a count to a list total is
  state-independent by construction."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.mfa.totp :as totp]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(defn- confirmed-totp [user-id]
  {:user_id      user-id
   :provider     "totp"
   :confirmed_at (t/instant)
   :credentials  {:secret (totp/generate-secret)}})

(defn- pending-totp [user-id]
  {:user_id     user-id
   :provider    "totp"
   :credentials {:secret (totp/generate-secret)}})

(defn- ids [response]
  (set (map :id (:data response))))

(deftest requires-superuser-test
  (doseq [endpoint ["ee/mfa/admin/enrolled-users" "ee/mfa/admin/unenrolled-users"]]
    (testing endpoint
      (mt/user-http-request :rasta :get 403 endpoint)
      (mt/user-http-request :crowberto :get 200 endpoint))))

(deftest enrolled-list-test
  (mt/with-temp [:model/User {enrolled-id :id} {}
                 :model/AuthIdentity _ (confirmed-totp enrolled-id)
                 :model/User {pending-id :id} {}
                 :model/AuthIdentity _ (pending-totp pending-id)
                 :model/User {plain-id :id} {}]
    (let [response (mt/user-http-request :crowberto :get 200 "ee/mfa/admin/enrolled-users")
          listed   (ids response)]
      (testing "lists users with a confirmed second factor"
        (is (contains? listed enrolled-id)))
      (testing "a started-but-unconfirmed enrollment is not enrolled"
        (is (not (contains? listed pending-id))))
      (is (not (contains? listed plain-id)))
      (let [row (first (filter #(= enrolled-id (:id %)) (:data response)))]
        (testing "carries the enrollment date"
          (is (some? (:enrolled_at row))))
        (testing "never exposes the encrypted credentials column"
          (is (not (contains? row :credentials))))))))

(deftest enrolled-list-includes-deactivated-test
  (testing "a deactivated user's enrollment still exists and is still removable, so they are listed"
    (mt/with-temp [:model/User {user-id :id} {:is_active false}
                   :model/AuthIdentity _ (confirmed-totp user-id)]
      (is (contains? (ids (mt/user-http-request :crowberto :get 200 "ee/mfa/admin/enrolled-users"))
                     user-id)))))

(deftest unenrolled-list-test
  (mt/with-temp [:model/User {enrolled-id :id} {}
                 :model/AuthIdentity _ (confirmed-totp enrolled-id)
                 :model/User {plain-id :id} {}
                 :model/User {pending-id :id} {}
                 :model/AuthIdentity _ (pending-totp pending-id)
                 :model/User {inactive-id :id} {:is_active false}]
    (let [listed (ids (mt/user-http-request :crowberto :get 200 "ee/mfa/admin/unenrolled-users"))]
      (is (contains? listed plain-id))
      (testing "a pending enrollment is no second factor, so they still need to act"
        (is (contains? listed pending-id)))
      (is (not (contains? listed enrolled-id)))
      (testing "deactivated users cannot log in, so they are not awaiting enrollment"
        (is (not (contains? listed inactive-id)))))))

(deftest unenrolled-list-includes-sso-users-test
  (testing "SSO users are listed even though the login gate never challenges them — this matches
           unenrolled_count, so the People-facing count and this list can never disagree"
    (mt/with-temp [:model/User {user-id :id} {:sso_source :google}]
      (is (contains? (ids (mt/user-http-request :crowberto :get 200 "ee/mfa/admin/unenrolled-users"))
                     user-id)))))

(deftest counts-match-lists-test
  (testing "each /admin/overview count equals its list's total, whatever else is in the app DB"
    (mt/with-temp [:model/User {enrolled-id :id} {}
                   :model/AuthIdentity _ (confirmed-totp enrolled-id)
                   :model/User {deactivated-id :id} {:is_active false}
                   :model/AuthIdentity _ (confirmed-totp deactivated-id)
                   :model/User _ {:sso_source :google}
                   :model/Tenant {tenant-id :id} {}
                   :model/User _ {:tenant_id tenant-id}
                   :model/User _ {}]
      (let [overview   (mt/user-http-request :crowberto :get 200 "ee/mfa/admin/overview")
            enrolled   (mt/user-http-request :crowberto :get 200 "ee/mfa/admin/enrolled-users")
            unenrolled (mt/user-http-request :crowberto :get 200 "ee/mfa/admin/unenrolled-users")]
        (is (= (:enrolled_count overview) (:total enrolled)))
        (is (= (:unenrolled_count overview) (:total unenrolled)))))))

(deftest search-test
  (mt/with-temp [:model/User {matching-id :id} {:first_name "Zqxwlast"
                                                :last_name  "Vbnmqwerty"
                                                :email      "zqxwlast@notarealdomain.test"}
                 :model/User {other-id :id} {:first_name "Aaaother" :last_name "Bbbother"}]
    (doseq [[what term] [["first name" "zqxwl"]
                         ["last name" "VBNMQ"]
                         ["email" "notarealdomain"]]]
      (testing (str "matches on " what ", case-insensitively")
        (let [listed (ids (mt/user-http-request :crowberto :get 200 "ee/mfa/admin/unenrolled-users"
                                                :query term))]
          (is (contains? listed matching-id))
          (is (not (contains? listed other-id))))))
    (testing "a query matching nobody returns no rows"
      (is (empty? (:data (mt/user-http-request :crowberto :get 200 "ee/mfa/admin/unenrolled-users"
                                               :query "nobodyhasthisnameatall")))))))

(deftest pagination-test
  (mt/with-temp [:model/User _ {:first_name "Pgnatest" :last_name "Aaa"}
                 :model/User _ {:first_name "Pgnatest" :last_name "Bbb"}]
    (let [page-of (fn [offset]
                    (mt/user-http-request :crowberto :get 200 "ee/mfa/admin/unenrolled-users"
                                          :query "pgnatest" :limit "1" :offset offset))
          first-page  (page-of "0")
          second-page (page-of "1")]
      (is (= 1 (count (:data first-page))))
      (is (= 2 (:total first-page)))
      (is (not= (ids first-page) (ids second-page)))
      (is (= 1 (:limit first-page)))
      (is (= 1 (:offset second-page))))
    (testing "an unpaged request returns every row and a nil limit (guards `LIMIT NULL`)"
      (let [response (mt/user-http-request :crowberto :get 200 "ee/mfa/admin/unenrolled-users"
                                           :query "pgnatest")]
        (is (nil? (:limit response)))
        (is (= 2 (count (:data response))))))))

(deftest not-feature-gated-test
  (testing "a lapsed licence must not hide who is enrolled — that is how an admin finds a lockout"
    (mt/with-premium-features #{}
      (mt/user-http-request :crowberto :get 200 "ee/mfa/admin/enrolled-users")
      (mt/user-http-request :crowberto :get 200 "ee/mfa/admin/unenrolled-users"))))

(ns metabase-enterprise.advanced-config.reset-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.advanced-config.reset :as reset]
   [metabase-enterprise.remote-sync.impl :as remote-sync.impl]
   [metabase.api-keys.core :as api-keys]
   [metabase.permissions.core :as perms]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [metabase.util.password :as u.password]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- seed-content!
  "Populate a blank app DB with one of everything the wipe must erase, plus the
  user/session/group rows and settings it must preserve. Returns the ids needed
  by the assertions."
  []
  (let [user-id    (t2/insert-returning-pk! :model/User {:first_name "Keep"
                                                         :last_name  "Me"
                                                         :email      "keep-me@example.com"
                                                         :password   "keep-me-password-123"})
        session-id "unsafe-init-test-session"
        _          (t2/insert! :model/Session {:id         session-id
                                               :key_hashed "unsafe-init-test-hash"
                                               :user_id    user-id})
        api-key-id (t2/insert-returning-pk! :model/ApiKey
                                            {:user_id       user-id
                                             :creator_id    user-id
                                             :updated_by_id user-id
                                             :name          "Parent key"
                                             ::api-keys/unhashed-key (api-keys/generate-key)})
        group-id   (t2/insert-returning-pk! :model/PermissionsGroup {:name "Custom Group"})
        _          (perms/add-user-to-group! user-id group-id)
        _          (t2/insert! :model/Permissions {:group_id group-id, :object "/collection/root/"})
        coll-id    (t2/insert-returning-pk! :model/Collection {:name "Wiped Collection"})
        db-id      (t2/insert-returning-pk! :model/Database {:name    "Wiped DB"
                                                             :engine  "h2"
                                                             :details "{}"})]
    (setting/set! :site-name "Old Site Name")
    (setting/set! :site-url "https://child.example.com")
    ;; raw row: the real setter validates the token against the store
    (t2/insert! :model/Setting {:key "premium-embedding-token" :value "fake-token"})
    (t2/insert! :model/Setting {:key "some-wiped-setting" :value "gone"})
    {:user-id user-id, :session-id session-id, :api-key-id api-key-id
     :group-id group-id, :coll-id coll-id, :db-id db-id}))

(deftest wipe-and-initialize-validates-before-wiping-test
  (mt/with-empty-h2-app-db!
    (let [{:keys [coll-id]} (seed-content!)]
      (testing "an invalid config throws before anything is deleted"
        (is (thrown? Exception (reset/wipe-and-initialize! {:version 1})))
        (is (t2/exists? :model/Collection :id coll-id))
        (is (= 1 (t2/count :model/Database)))))))

(deftest wipe-and-initialize-test
  (mt/with-empty-h2-app-db!
    (let [{:keys [user-id session-id api-key-id group-id coll-id]} (seed-content!)
          all-users-id (:id (perms/all-users-group))
          admin-id     (:id (perms/admin-group))]
      (reset/wipe-and-initialize! {:version 1
                                   :config  {:settings {:site-name "Fresh Instance"}}})
      (testing "content is gone; the Trash collection is re-seeded"
        (is (not (t2/exists? :model/Collection :id coll-id)))
        (is (= ["trash"] (t2/select-fn-vec :type :model/Collection)))
        (is (zero? (t2/count :model/Database))))
      (testing "users, sessions, groups, and memberships survive"
        (is (t2/exists? :model/User :id user-id))
        (is (t2/exists? :model/Session :id session-id))
        (is (t2/exists? :model/PermissionsGroup :id group-id))
        (is (t2/exists? :model/PermissionsGroupMembership :user_id user-id :group_id group-id)))
      (testing "password login credentials survive and still verify"
        (let [{:keys [password_hash password_salt]}
              (:credentials (t2/select-one :model/AuthIdentity :user_id user-id :provider "password"))]
          (is (some? password_hash))
          (is (u.password/verify-password "keep-me-password-123" password_salt password_hash))))
      (testing "API keys survive, so the caller can init again"
        (is (t2/exists? :model/ApiKey :id api-key-id)))
      (testing "permission grants are reset to fresh-instance defaults"
        (is (not (t2/exists? :model/Permissions :group_id group-id)))
        (is (= all-users-id (:id (perms/all-users-group))))
        (is (= admin-id (:id (perms/admin-group))))
        (is (t2/exists? :model/Permissions :group_id admin-id :object "/"))
        (is (t2/exists? :model/Permissions :group_id all-users-id :object "/collection/root/"))
        (is (t2/exists? :model/Permissions :group_id all-users-id :object "/application/subscription/"))
        (is (t2/exists? :model/Permissions :group_id all-users-id :object "/collection/namespace/snippets/root/")))
      (testing "preserved settings survive; everything else is wiped or comes from the config"
        (is (= "fake-token" (t2/select-one-fn :value :model/Setting :key "premium-embedding-token")))
        (is (= "https://child.example.com" (t2/select-one-fn :value :model/Setting :key "site-url")))
        (is (nil? (t2/select-one :model/Setting :key "some-wiped-setting")))
        (is (= "Fresh Instance" (setting/get :site-name)))))))

(deftest wipe-and-initialize-triggers-remote-sync-import-test
  (mt/with-empty-h2-app-db!
    (testing "when the applied settings configure remote sync, a full import is started"
      (let [import-args (atom nil)]
        (with-redefs [remote-sync.impl/async-import! (fn [branch force? _opts & _kvs]
                                                       (reset! import-args {:branch branch :force? force?})
                                                       nil)]
          (reset/wipe-and-initialize!
           {:version 1
            :config  {:settings {:remote-sync-url    "https://github.com/acme/content.git"
                                 :remote-sync-token  "fake-pat"
                                 :remote-sync-branch "main"
                                 :remote-sync-type   "read-write"}}})
          (is (= {:branch "main", :force? true} @import-args)))))))

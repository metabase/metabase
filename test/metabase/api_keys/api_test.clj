(ns metabase.api-keys.api-test
  "Tests for /api/api-key endpoints"
  (:require
   [clojure.test :refer :all]
   [metabase.api-keys.core :as-alias api-keys]
   [metabase.api-keys.models.api-key :as api-key]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :test-users :web-server))

(deftest api-key-creation-test
  (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Cool Friends"}]
    (testing "POST /api/api-key works"
      (let [name (str (random-uuid))
            resp (mt/user-http-request :crowberto :post 200 "api-key"
                                       {:group_id group-id
                                        :name     name})]
        (is (= #{:name :group :unmasked_key :masked_key :id :created_at :updated_at :updated_by}
               (-> resp keys set)))
        (is (= (select-keys (mt/fetch-user :crowberto) [:id :common_name])
               (:updated_by resp)))
        (is (= {:name "Cool Friends" :id group-id} (:group resp)))
        (is (= name (:name resp)))))))

(deftest api-key-creation-test-2
  (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Cool Friends"}]
    (testing "Trying to create another API key with the same name fails"
      (let [key-name (str (random-uuid))]
        ;; works once...
        (is (= #{:unmasked_key :masked_key :group :name :id :created_at :updated_at :updated_by}
               (set (keys (mt/user-http-request :crowberto :post 200 "api-key"
                                                {:group_id group-id
                                                 :name     key-name})))))
        (is (= {:errors {:name "An API key with this name already exists."}}
               (mt/user-http-request :crowberto :post 400 "api-key"
                                     {:group_id group-id
                                      :name     key-name})))))))

(deftest api-key-creation-test-3
  (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Cool Friends"}]
    (testing "API key generation is retried if a prefix collision occurs"
      ;; mock out the `api-key/generate-key` function to generate the same key (with the same prefix) repeatedly
      (let [generated-key  (api-key/generate-key)
            generated-keys (atom [generated-key
                                  generated-key
                                  generated-key
                                  generated-key
                                  (api-key/generate-key)])]
        (with-redefs [api-key/generate-key (fn [] (let [next-val (first @generated-keys)]
                                                    (swap! generated-keys next)
                                                    next-val))]
          ;; put an API Key in the database with that key.
          (mt/with-temp [:model/ApiKey _ {::api-keys/unhashed-key generated-key
                                          :name                   "my cool name"
                                          :user_id                (mt/user->id :crowberto)
                                          :creator_id             (mt/user->id :crowberto)
                                          :updated_by_id          (mt/user->id :crowberto)}]
            ;; this will try to generate a new API key
            (mt/user-http-request :crowberto :post 200 "api-key"
                                  {:group_id group-id
                                   :name     (str (random-uuid))})
            ;; we've exhausted the `generated-keys` we mocked
            (is (empty? @generated-keys))))))))

(deftest api-key-creation-test-4
  (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Cool Friends"}]
    (testing "We don't retry forever if prefix collision keeps happening"
      (let [generated-key (api-key/generate-key)]
        (with-redefs [api-key/generate-key (constantly generated-key)]
          (mt/with-temp [:model/ApiKey _ {::api-keys/unhashed-key generated-key
                                          :name                   "my cool name"
                                          :user_id                (mt/user->id :crowberto)
                                          :creator_id             (mt/user->id :crowberto)
                                          :updated_by_id          (mt/user->id :crowberto)}]
            (is (= "could not generate key with unique prefix"
                   (:message (mt/user-http-request :crowberto :post 500 "api-key"
                                                   {:group_id group-id
                                                    :name     (str (random-uuid))}))))))))))

(deftest api-key-creation-test-5
  (testing "POST /api/api-key"
    (testing "A group is required"
      (is (= {:errors          {:group_id "value must be an integer greater than zero."}
              :specific-errors {:group_id ["value must be an integer greater than zero., received: nil"]}}
             (mt/user-http-request :crowberto :post 400 "api-key"
                                   {:group_id nil
                                    :name     (str (random-uuid))}))))))

(deftest api-key-creation-test-6
  (testing "POST /api/api-key"
    (testing "The group can be 'All Users'"
      (is (mt/user-http-request :crowberto :post 200 "api-key"
                                {:group_id (:id (perms-group/all-users))
                                 :name     (str (random-uuid))}))
      (is (= "All Users"
             (get-in (mt/user-http-request :crowberto :post 200 "api-key"
                                           {:group_id (:id (perms-group/all-users))
                                            :name (str (random-uuid))})
                     [:group :name]))))))

(deftest api-key-creation-test-7
  (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Cool Friends"}]
    (testing "A non-empty name is required"
      (is (= {:errors          {:name "value must be a non-blank string."}
              :specific-errors {:name ["should be at least 1 character, received: \"\"" "non-blank string, received: \"\""]}}
             (mt/user-http-request :crowberto :post 400 "api-key"
                                   {:group_id group-id
                                    :name     ""}))))))

(deftest api-key-creation-test-8
  (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Cool Friends"}]
    (testing "A non-blank name is required"
      (is (= {:errors          {:name "value must be a non-blank string."}
              :specific-errors {:name ["non-blank string, received: \"   \""]}}
             (mt/user-http-request :crowberto :post 400 "api-key"
                                   {:group_id group-id
                                    :name     "   "}))))))

(deftest api-count-works
  (mt/with-empty-h2-app-db!
    (is ((fnil zero? -1) (mt/user-http-request :crowberto :get 200 "api-key/count")))
    (mt/with-temp [:model/ApiKey _ {::api-keys/unhashed-key (api-key/generate-key)
                                    :name                   "my cool name"
                                    :user_id                (mt/user->id :crowberto)
                                    :creator_id             (mt/user->id :crowberto)
                                    :updated_by_id          (mt/user->id :crowberto)}]
      (is (= 1 (mt/user-http-request :crowberto :get 200 "api-key/count")))
      (mt/with-temp [:model/ApiKey _ {::api-keys/unhashed-key (api-key/generate-key)
                                      :name                   "my cool OTHER name"
                                      :user_id                (mt/user->id :crowberto)
                                      :creator_id             (mt/user->id :crowberto)
                                      :updated_by_id          (mt/user->id :crowberto)}]
        (is (= 2 (mt/user-http-request :crowberto :get 200 "api-key/count"))))
      (testing "API keys with non-default scopes, like SCIM, are excluded"
        (mt/with-temp [:model/ApiKey _ {::api-keys/unhashed-key (api-key/generate-key)
                                        :name                   "my cool OTHER name"
                                        :user_id                (mt/user->id :crowberto)
                                        :creator_id             (mt/user->id :crowberto)
                                        :updated_by_id          (mt/user->id :crowberto)
                                        :scope                  :scim}]
          (is (= 1 (mt/user-http-request :crowberto :get 200 "api-key/count"))))))))

(deftest api-keys-work-e2e
  (testing "We can create a new API key and then use it for authentication"
    (let [{api-key :unmasked_key
           id      :id} (mt/user-http-request :crowberto :post 200 "api-key"
                                              {:group_id (:id (perms-group/all-users))
                                               :name     (str (random-uuid))})]
      ;; the exact endpoint here doesn't really matter - we just want to make an API call that requires auth
      (is (client/client :get 200 "user/current" {:request-options {:headers {"x-api-key" api-key}}}))
      (is (= "Unauthenticated"
             (client/client :get 401 "user/current" {:request-options {:headers {"x-api-key" "mb_not_an_api_key"}}})))
      (let [user-id (:id (client/client :get 200 "user/current" {:request-options {:headers {"x-api-key" api-key}}}))]
        (is (not (t2/exists? :model/Collection :personal_owner_id user-id))))
      (testing "A deleted API Key can no longer be used"
        (mt/user-http-request :crowberto :delete 204 (format "api-key/%s" id))
        (is (= "Unauthenticated"
               (client/client :get 401 "user/current" {:request-options {:headers {"x-api-key" api-key}}})))))))

(deftest api-keys-can-be-updated
  (mt/with-temp [:model/PermissionsGroup {group-id-1 :id} {:name "Cool Friends"}
                 :model/PermissionsGroup {group-id-2 :id} {:name "Uncool Friends"}]
    ;; create the API Key
    (let [{id :id :as create-resp}
          (mt/user-http-request :crowberto
                                :post 200 "api-key"
                                {:group_id group-id-1
                                 :name     (str (random-uuid))})
          _                (assert (t2/exists? :model/ApiKey id))
          _                (is (= "Cool Friends" (-> create-resp :group :name)))
          api-user-id      (t2/select-one-fn :user_id :model/ApiKey :id id)
          member-of-group? (fn [group-id]
                             (t2/exists? :model/PermissionsGroupMembership
                                         :user_id api-user-id
                                         :group_id group-id))]
      (is (member-of-group? group-id-1))
      (is (not (member-of-group? group-id-2)))
      (testing "You can change the group of an API key"
        (is (=? {:group {:id group-id-2, :name "Uncool Friends"}}
                (mt/user-http-request :crowberto :put 200 (format "api-key/%s" id) {:group_id group-id-2})))
        (is (= "Uncool Friends"
               (t2/select-one-fn :name :model/PermissionsGroup group-id-2)))
        (is (not (member-of-group? group-id-1)))
        (is (member-of-group? group-id-2))))))

(deftest api-keys-can-be-updated-2
  (mt/with-temp [:model/PermissionsGroup {group-id-1 :id} {:name "Cool Friends"}]
    (testing "You can change the name of an API key"
      (let [name-1      (str "My First Name" (random-uuid))
            name-2      (str "My Second Name" (random-uuid))
            {id :id}    (mt/user-http-request :crowberto
                                              :post 200 "api-key"
                                              {:group_id group-id-1
                                               :name     name-1})
            api-user-id (-> (t2/select-one :model/ApiKey :id id) (t2/hydrate :user) :user :id)]
        (testing "before the change..."
          (is (= name-1 (:common_name (t2/select-one :model/User api-user-id)))))
        (testing "after the change..."
          (mt/user-http-request :crowberto :put 200 (str "api-key/" id)
                                {:name name-2})
          (is (= name-2 (:common_name (t2/select-one :model/User api-user-id)))))
        (testing "the shape of the response is correct"
          (is (= #{:created_at :updated_at :updated_by :id :group :name :masked_key}
                 (set (keys (mt/user-http-request :crowberto :put 200 (str "api-key/" id)
                                                  {:name name-1}))))))))))

(deftest api-keys-can-be-updated-3
  (testing "A nonexistent API Key can't be updated"
    (mt/user-http-request :crowberto :put 404 (format "api-key/%s/regenerate" (+ 13371337 (rand-int 100))))))

(deftest api-keys-can-be-regenerated
  (testing "You can regenerate an API key"
    (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Cool Friends"}]
      (let [{id :id old-key :unmasked_key, :as response}
            (mt/user-http-request :crowberto
                                  :post 200 "api-key"
                                  {:group_id group-id
                                   :name (str (random-uuid))})

            _ (is (=? {:id pos-int?}
                      response))
            _ (is (client/client :get 200 "user/current" {:request-options {:headers {"x-api-key" old-key}}}))

            {new-key :unmasked_key, :as response}
            (mt/user-http-request :crowberto
                                  :put 200 (format "api-key/%s/regenerate" id))]
        (is (= #{:id :unmasked_key :masked_key :prefix}
               (cond-> response
                 (map? response) (-> keys set))))
        (is (= "Unauthenticated"
               (client/client :get 401 "user/current" {:request-options {:headers {"x-api-key" old-key}}})))
        (is (=? {}
                (client/client :get 200 "user/current" {:request-options {:headers {"x-api-key" new-key}}})))))))

(deftest api-keys-can-be-regenerated-2
  (testing "A nonexistent API Key can't be regenerated"
    (mt/user-http-request :crowberto
                          :put 404 (format "api-key/%s/regenerate" (+ 13371337 (rand-int 100))))))

(deftest api-keys-can-be-listed
  (mt/with-empty-h2-app-db!
    (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Cool Friends"}]
      (is (= [] (mt/user-http-request :crowberto :get 200 "api-key")))
      (mt/user-http-request :crowberto
                            :post 200 "api-key"
                            {:group_id group-id
                             :name     "My First API Key"})
      (is (= [{:name       "My First API Key"
               :group      {:name "Cool Friends"
                            :id   group-id}
               :updated_by (select-keys (mt/fetch-user :crowberto) [:common_name :id])}]
             (map #(select-keys % [:name :group :updated_by])
                  (mt/user-http-request :crowberto :get 200 "api-key"))))
      (mt/user-http-request :crowberto
                            :post 200 "api-key"
                            {:group_id (:id (perms-group/all-users))
                             :name     "My Second API Key"})
      (is (= [{:name  "My First API Key"
               :group {:name "Cool Friends"
                       :id   group-id}}
              {:name  "My Second API Key"
               :group {:name "All Users"
                       :id   (:id (perms-group/all-users))}}]
             (map #(select-keys % [:name :group])
                  (mt/user-http-request :crowberto :get 200 "api-key"))))
      (testing "API keys with non-default scopes, like SCIM, are excluded"
        (mt/with-temp [:model/ApiKey _ {::api-keys/unhashed-key (api-key/generate-key)
                                        :name                   "SCIM API key"
                                        :user_id                (mt/user->id :crowberto)
                                        :creator_id             (mt/user->id :crowberto)
                                        :updated_by_id          (mt/user->id :crowberto)
                                        :scope                  :scim}]
          (is (= 2 (count (mt/user-http-request :crowberto :get 200 "api-key")))))))))

(deftest api-keys-can-be-deleted
  (mt/with-empty-h2-app-db!
    (is (= [] (mt/user-http-request :crowberto :get 200 "api-key")))

    (let [{id :id} (mt/user-http-request :crowberto
                                         :post 200 "api-key"
                                         {:group_id (:id (perms-group/all-users))
                                          :name     "My First API Key"})]
      (assert (pos-int? id))
      (is (= 1 (count (mt/user-http-request :crowberto :get 200 "api-key"))))
      (is (= 1 (mt/user-http-request :crowberto :get 200 "api-key/count")))
      (mt/user-http-request :crowberto :delete 204 (format "api-key/%s" id))
      (is (zero? (count (mt/user-http-request :crowberto :get 200 "api-key"))))
      (is (zero? (mt/user-http-request :crowberto :get 200 "api-key/count")))
      (testing "Deleting a nonexistent API Key returns a 404"
        (mt/user-http-request :crowberto :delete 404 (format "api-key/%s" id))))))

(deftest api-key-operations-are-audit-logged
  (mt/with-premium-features #{:audit-app}
    (mt/with-empty-h2-app-db!
      (mt/with-temp [:model/PermissionsGroup {group-id-1 :id} {:name "Cool Friends"}]
        ;; create the API key
        (let [{id :id} (mt/user-http-request :crowberto
                                             :post 200 "api-key"
                                             {:group_id group-id-1
                                              :name     "My API Key"})]
          (testing "Creation was audit logged"
            (is (=? {:details  {:name    "My API Key"
                                :group   {:name "Cool Friends"}
                                :user_id (t2/select-one-fn :user_id :model/ApiKey id)}
                     :model    "ApiKey"
                     :model_id id
                     :user_id  (mt/user->id :crowberto)}
                    (mt/latest-audit-log-entry :api-key-create id)))
            (is (= #{:name :group :key_prefix :user_id}
                   (-> (mt/latest-audit-log-entry :api-key-create id) :details keys set)))))))))

(deftest api-key-operations-are-audit-logged-2
  (mt/with-premium-features #{:audit-app}
    (mt/with-empty-h2-app-db!
      (mt/with-temp [:model/PermissionsGroup {group-id-1 :id} {:name "Cool Friends"}
                     :model/PermissionsGroup {group-id-2 :id} {:name "Less Cool Friends"}]
        ;; create the API key
        (let [{id :id} (mt/user-http-request :crowberto
                                             :post 200 "api-key"
                                             {:group_id group-id-1
                                              :name     "My API Key"})
              url      (fn [url] (format url id))]
          (testing "Update is audit logged"
            (is (=? {:id pos-int?}
                    (mt/user-http-request :crowberto
                                          :put 200 (url "api-key/%s")
                                          {:group_id group-id-2
                                           :name     "A New Name"})))
            (is (=? {:details  {:previous {:name  "My API Key"
                                           :group {:name "Cool Friends"}}
                                :new      {:name  "A New Name"
                                           :group {:name "Less Cool Friends"}}}
                     :model    "ApiKey"
                     :model_id id
                     :user_id  (mt/user->id :crowberto)}
                    (mt/latest-audit-log-entry :api-key-update id)))))))))

(deftest api-key-operations-are-audit-logged-3
  (mt/with-premium-features #{:audit-app}
    (mt/with-empty-h2-app-db!
      (mt/with-temp [:model/PermissionsGroup {group-id-1 :id} {:name "Cool Friends"}]
        ;; create the API key
        (let [{id           :id
               unmasked-key :unmasked_key} (mt/user-http-request :crowberto
                                                                 :post 200 "api-key"
                                                                 {:group_id group-id-1
                                                                  :name     "My API Key"})
              old-prefix                   (api-key/prefix unmasked-key)
              url                          (fn [url] (format url id))]
          (testing "Regeneration is audit logged"
            (let [{unmasked-key :unmasked_key} (mt/user-http-request :crowberto :put 200 (url "api-key/%s/regenerate"))
                  _                            (assert (string? unmasked-key))
                  new-prefix                   (api-key/prefix unmasked-key)]
              (is (=? {:details  {:previous {:key_prefix old-prefix}
                                  :new      {:key_prefix new-prefix}}
                       :model    "ApiKey"
                       :model_id id
                       :user_id  (mt/user->id :crowberto)}
                      (mt/latest-audit-log-entry :api-key-regenerate id))))))))))

(deftest api-key-operations-are-audit-logged-4
  (mt/with-premium-features #{:audit-app}
    (mt/with-empty-h2-app-db!
      (mt/with-temp [:model/PermissionsGroup {group-id-1 :id} {:name "Cool Friends"}]
        ;; create the API key
        (let [{id :id} (mt/user-http-request :crowberto
                                             :post 200 "api-key"
                                             {:group_id group-id-1
                                              :name     "My API Key"})
              url      (fn [url] (format url id))]
          (testing "Deletion is audit logged"
            (is (nil? (mt/user-http-request :crowberto
                                            :delete 204 (url "api-key/%s"))))
            (is (=? {:details  {:name  "My API Key"
                                :group {:name "Cool Friends"}}
                     :model    "ApiKey"
                     :model_id id
                     :user_id  (mt/user->id :crowberto)}
                    (mt/latest-audit-log-entry :api-key-delete id)))))))))

(deftest do-not-mark-user-inactive-when-deleting-api-key-for-normal-user-test
  (mt/with-temp [:model/ApiKey {api-key-id :id} {::api-keys/unhashed-key "mb_1234567890"
                                                 :name                   (mt/random-name)
                                                 :user_id                (mt/user->id :crowberto)
                                                 :creator_id             (mt/user->id :crowberto)
                                                 :updated_by_id          (mt/user->id :crowberto)}]
    (is (nil? (mt/user-http-request :crowberto :delete 204 (format "api-key/%d" api-key-id))))
    (is (true? (t2/select-one-fn :is_active :model/User :id (mt/user->id :crowberto))))))

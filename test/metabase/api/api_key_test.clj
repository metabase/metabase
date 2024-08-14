(ns ^:mb/once metabase.api.api-key-test
  "Tests for /api/api-key endpoints"
  (:require
   [clojure.test :refer [deftest testing is]]
   [metabase.http-client :as client]
   [metabase.models.api-key :as api-key]
   [metabase.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest api-key-creation-test
  (t2.with-temp/with-temp [:model/PermissionsGroup {group-id :id} {:name "Cool Friends"}]
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
        (is (= name (:name resp)))))
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
                                      :name     key-name})))))
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
          (t2.with-temp/with-temp [:model/ApiKey _ {:unhashed_key  generated-key
                                                    :name          "my cool name"
                                                    :user_id       (mt/user->id :crowberto)
                                                    :creator_id (mt/user->id :crowberto)
                                                    :updated_by_id (mt/user->id :crowberto)}]
            ;; this will try to generate a new API key
            (mt/user-http-request :crowberto :post 200 "api-key"
                                  {:group_id group-id
                                   :name     (str (random-uuid))})
            ;; we've exhausted the `generated-keys` we mocked
            (is (empty? @generated-keys))))))
    (testing "We don't retry forever if prefix collision keeps happening"
      (let [generated-key (api-key/generate-key)]
        (with-redefs [api-key/generate-key (constantly generated-key)]
          (t2.with-temp/with-temp [:model/ApiKey _ {:unhashed_key  generated-key
                                                    :name          "my cool name"
                                                    :user_id       (mt/user->id :crowberto)
                                                    :creator_id (mt/user->id :crowberto)
                                                    :updated_by_id (mt/user->id :crowberto)}]
            (is (= "could not generate key with unique prefix"
                   (:message (mt/user-http-request :crowberto :post 500 "api-key"
                                                   {:group_id group-id
                                                    :name     (str (random-uuid))}))))))))
    (testing "A group is required"
      (is (= {:errors          {:group_id "value must be an integer greater than zero."}
              :specific-errors {:group_id ["value must be an integer greater than zero., received: nil"]}}
             (mt/user-http-request :crowberto :post 400 "api-key"
                                   {:group_id nil
                                    :name     (str (random-uuid))}))))
    (testing "The group can be 'All Users'"
      (is (mt/user-http-request :crowberto :post 200 "api-key"
                                {:group_id (:id (perms-group/all-users))
                                 :name     (str (random-uuid))}))
      (is (= "All Users"
             (get-in (mt/user-http-request :crowberto :post 200 "api-key"
                                           {:group_id (:id (perms-group/all-users))
                                            :name (str (random-uuid))})
                     [:group :name]))))
    (testing "A non-empty name is required"
      (is (= {:errors          {:name "value must be a non-blank string."}
              :specific-errors {:name ["should be at least 1 character, received: \"\"" "non-blank string, received: \"\""]}}
             (mt/user-http-request :crowberto :post 400 "api-key"
                                   {:group_id group-id
                                    :name     ""}))))
    (testing "A non-blank name is required"
      (is (= {:errors          {:name "value must be a non-blank string."}
              :specific-errors {:name ["non-blank string, received: \"   \""]}}
             (mt/user-http-request :crowberto :post 400 "api-key"
                                   {:group_id group-id
                                    :name     "   "}))))))

(deftest api-count-works
  (mt/with-empty-h2-app-db
    (is (zero? (mt/user-http-request :crowberto :get 200 "api-key/count")))
    (t2.with-temp/with-temp [:model/ApiKey _ {:unhashed_key  (api-key/generate-key)
                                              :name          "my cool name"
                                              :user_id       (mt/user->id :crowberto)
                                              :creator_id    (mt/user->id :crowberto)
                                              :updated_by_id (mt/user->id :crowberto)}]
      (is (= 1 (mt/user-http-request :crowberto :get 200 "api-key/count")))
      (t2.with-temp/with-temp [:model/ApiKey _ {:unhashed_key  (api-key/generate-key)
                                                :name          "my cool OTHER name"
                                                :user_id       (mt/user->id :crowberto)
                                                :creator_id    (mt/user->id :crowberto)
                                                :updated_by_id (mt/user->id :crowberto)}]
        (is (= 2 (mt/user-http-request :crowberto :get 200 "api-key/count"))))

      (testing "API keys with non-default scopes, like SCIM, are excluded"
        (t2.with-temp/with-temp [:model/ApiKey _ {:unhashed_key  (api-key/generate-key)
                                                  :name          "my cool OTHER name"
                                                  :user_id       (mt/user->id :crowberto)
                                                  :creator_id    (mt/user->id :crowberto)
                                                  :updated_by_id (mt/user->id :crowberto)
                                                  :scope         "scim"}]
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
      (testing "A deleted API Key can no longer be used"
        (mt/user-http-request :crowberto :delete 204 (format "api-key/%s" id))
        (is (= "Unauthenticated"
               (client/client :get 401 "user/current" {:request-options {:headers {"x-api-key" api-key}}})))))))

(deftest api-keys-can-be-updated
  (t2.with-temp/with-temp [:model/PermissionsGroup {group-id-1 :id} {:name "Cool Friends"}
                           :model/PermissionsGroup {group-id-2 :id} {:name "Uncool Friends"}]
    ;; create the API Key
    (let [{id :id :as create-resp}
          (mt/user-http-request :crowberto
                                :post 200 "api-key"
                                {:group_id group-id-1
                                 :name     (str (random-uuid))})
          _                (is (= "Cool Friends" (-> create-resp :group :name)))
          api-user-id      (:id (:user (t2/hydrate (t2/select-one :model/ApiKey :id id) :user)))
          member-of-group? (fn [group-id]
                             (t2/exists? :model/PermissionsGroupMembership
                                         :user_id api-user-id
                                         :group_id group-id))]
      (is (member-of-group? group-id-1))
      (is (not (member-of-group? group-id-2)))
      (testing "You can change the group of an API key"
        (is (= "Uncool Friends"
               (-> (mt/user-http-request :crowberto :put 200 (format "api-key/%s" id) {:group_id group-id-2})
                   :group
                   :name)))
        (is (not (member-of-group? group-id-1)))
        (is (member-of-group? group-id-2))))
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
                                                  {:name name-1}))))))))
    (testing "A nonexistent API Key can't be updated"
      (mt/user-http-request :crowberto
                            :put 404 (format "api-key/%s/regenerate" (+ 13371337 (rand-int 100)))))))

(deftest api-keys-can-be-regenerated
  (testing "You can regenerate an API key"
    (t2.with-temp/with-temp [:model/PermissionsGroup {group-id :id} {:name "Cool Friends"}]
      (let [{id :id old-key :unmasked_key}
            (mt/user-http-request :crowberto
                                  :post 200 "api-key"
                                  {:group_id group-id
                                   :name (str (random-uuid))})
            _ (is (client/client :get 200 "user/current" {:request-options {:headers {"x-api-key" old-key}}}))
            {:as resp new-key :unmasked_key}
            (mt/user-http-request :crowberto
                                  :put 200 (format "api-key/%s/regenerate" id))]
        (is (= #{:created_at :updated_at :id :name :unmasked_key :masked_key :group :updated_by}
               (set (keys resp))))
        (is (client/client :get 401 "user/current" {:request-options {:headers {"x-api-key" old-key}}}))
        (is (client/client :get 200 "user/current" {:request-options {:headers {"x-api-key" new-key}}})))))
  (testing "A nonexistent API Key can't be regenerated"
    (mt/user-http-request :crowberto
                          :put 404 (format "api-key/%s/regenerate" (+ 13371337 (rand-int 100))))))

(deftest api-keys-can-be-listed
  (mt/with-empty-h2-app-db
    (t2.with-temp/with-temp [:model/PermissionsGroup {group-id :id} {:name "Cool Friends"}]
      (is (= [] (mt/user-http-request :crowberto :get 200 "api-key")))

      (mt/user-http-request :crowberto
                            :post 200 "api-key"
                            {:group_id group-id
                             :name     "My First API Key"})
      (is (= [{:name       "My First API Key"
               :group {:name "Cool Friends"
                       :id group-id}
               :updated_by (select-keys (mt/fetch-user :crowberto) [:common_name :id])}]
             (map #(select-keys % [:name :group :updated_by])
                  (mt/user-http-request :crowberto :get 200 "api-key"))))

      (mt/user-http-request :crowberto
                            :post 200 "api-key"
                            {:group_id (:id (perms-group/all-users))
                             :name "My Second API Key"})

      (is (= [{:name "My First API Key"
               :group {:name "Cool Friends"
                       :id group-id}}
              {:name "My Second API Key"
               :group {:name "All Users"
                       :id (:id (perms-group/all-users))}}]
             (map #(select-keys % [:name :group])
                  (mt/user-http-request :crowberto :get 200 "api-key"))))

      (testing "API keys with non-default scopes, like SCIM, are excluded"
        (t2.with-temp/with-temp [:model/ApiKey _ {:unhashed_key  (api-key/generate-key)
                                                  :name          "SCIM API key"
                                                  :user_id       (mt/user->id :crowberto)
                                                  :creator_id    (mt/user->id :crowberto)
                                                  :updated_by_id (mt/user->id :crowberto)
                                                  :scope         "scim"}]
          (is (= 2 (count (mt/user-http-request :crowberto :get 200 "api-key")))))))))

(deftest api-keys-can-be-deleted
  (mt/with-empty-h2-app-db
    (is (= [] (mt/user-http-request :crowberto :get 200 "api-key")))

    (let [{id :id} (mt/user-http-request :crowberto
                                         :post 200 "api-key"
                                         {:group_id (:id (perms-group/all-users))
                                          :name     "My First API Key"})]
      (is (= 1 (count (mt/user-http-request :crowberto :get 200 "api-key"))))
      (is (= 1 (mt/user-http-request :crowberto :get 200 "api-key/count")))
      (mt/user-http-request :crowberto :delete 204 (format "api-key/%s" id))
      (is (zero? (count (mt/user-http-request :crowberto :get 200 "api-key"))))
      (is (zero? (mt/user-http-request :crowberto :get 200 "api-key/count")))
      (testing "Deleting a nonexistent API Key returns a 404"
        (mt/user-http-request :crowberto :delete 404 (format "api-key/%s" id))))))

(deftest api-key-operations-are-audit-logged
  (mt/with-premium-features #{:audit-app}
    (mt/with-empty-h2-app-db
      (t2.with-temp/with-temp [:model/PermissionsGroup {group-id-1 :id} {:name "Cool Friends"}
                               :model/PermissionsGroup {group-id-2 :id} {:name "Less Cool Friends"}]
        ;; create the API key
        (let [{id           :id
               unmasked-key :unmasked_key} (mt/user-http-request :crowberto
                                                                 :post 200 "api-key"
                                                                 {:group_id group-id-1
                                                                  :name     "My API Key"})
              old-prefix                   (api-key/prefix unmasked-key)
              url                          (fn [url] (format url id))]
          (testing "Creation was audit logged"
            (is (=? {:details  {:name       "My API Key"
                                :group      {:name  "Cool Friends"}
                                :user_id    (t2/select-one-fn :user_id :model/ApiKey id)}
                     :model    "ApiKey"
                     :model_id id
                     :user_id  (mt/user->id :crowberto)}
                    (mt/latest-audit-log-entry :api-key-create id)))
            (is (= #{:name :group :key_prefix :user_id}
                   (-> (mt/latest-audit-log-entry :api-key-create id) :details keys set))))
          (testing "Update is audit logged"
            (mt/user-http-request :crowberto
                                  :put 200 (url "api-key/%s")
                                  {:group_id group-id-2
                                   :name     "A New Name"})
            (is (=? {:details  {:previous {:name       "My API Key"
                                           :group {:name "Cool Friends"}}
                                :new      {:name       "A New Name"
                                           :group {:name "Less Cool Friends"}}}
                     :model    "ApiKey"
                     :model_id id
                     :user_id  (mt/user->id :crowberto)}
                    (mt/latest-audit-log-entry :api-key-update id))))
          (testing "Regeneration is audit logged"
            (let [{:keys [unmasked_key]}
                  (mt/user-http-request :crowberto
                                        :put 200 (url "api-key/%s/regenerate"))
                  new-prefix (api-key/prefix unmasked_key)]
              (is (=? {:details  {:previous {:key_prefix old-prefix}
                                  :new      {:key_prefix new-prefix}}
                       :model    "ApiKey"
                       :model_id id
                       :user_id  (mt/user->id :crowberto)}
                      (mt/latest-audit-log-entry :api-key-regenerate id)))))
          (testing "Deletion is audit logged"
            (mt/user-http-request :crowberto
                                  :delete 204 (url "api-key/%s"))
            (is (=? {:details  {:name       "A New Name"
                                :group {:name "Less Cool Friends"}}
                     :model    "ApiKey"
                     :model_id id
                     :user_id  (mt/user->id :crowberto)}
                    (mt/latest-audit-log-entry :api-key-delete id)))))))))

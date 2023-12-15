(ns ^:mb/once metabase.api.api-key-test
  "Tests for /api/api-key endpoints"
  (:require
   [clojure.test :refer [deftest testing is]]
   [metabase.models.api-key :as api-key]
   [metabase.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest api-key-creation-test
  (t2.with-temp/with-temp
      [:model/PermissionsGroup {group-id :id} {:name "Cool Friends"}]
    (testing "POST /api/api-key works"
      (let [name (str (random-uuid))
            resp (mt/user-http-request :crowberto :post 200 "api-key"
                                       {:group_id group-id
                                        :name     name})]
        (is (= #{:name :group_id :unmasked_key :masked_key}
               (-> resp keys set)))
        (is (= name (:name resp)))))
    (testing "Trying to create another API key with the same name fails"
      (let [key-name (str (random-uuid))]
        ;; works once...
        (is (= #{:unmasked_key :masked_key :group_id :name}
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
          (t2.with-temp/with-temp
              [:model/ApiKey _ {:unhashed_key generated-key
                                :name         "my cool name"
                                :user_id      (mt/user->id :crowberto)
                                :created_by   (mt/user->id :crowberto)}]
            ;; this will try to generate a new API key
            (mt/user-http-request :crowberto :post 200 "api-key"
                                  {:group_id group-id
                                   :name     (str (random-uuid))})
            ;; we've exhausted the `generated-keys` we mocked
            (is (empty? @generated-keys))))))
    (testing "We don't retry forever if prefix collision keeps happening"
      (let [generated-key (api-key/generate-key)]
        (with-redefs [api-key/generate-key (constantly generated-key)]
          (t2.with-temp/with-temp
              [:model/ApiKey _ {:unhashed_key generated-key
                                :name         "my cool name"
                                :user_id      (mt/user->id :crowberto)
                                :created_by   (mt/user->id :crowberto)}]
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
                                 :name     (str (random-uuid))})))
    (testing "A non-empty name is required"
      (is (= {:errors          {:name "value must be a non-blank string."}
              :specific-errors {:name ["should be at least 1 characters, received: \"\"" "non-blank string, received: \"\""]}}
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
    (t2.with-temp/with-temp
        [:model/ApiKey _ {:unhashed_key "prefix_key"
                          :name         "my cool name"
                          :user_id      (mt/user->id :crowberto)
                          :created_by   (mt/user->id :crowberto)}]
      (is (= 1 (mt/user-http-request :crowberto :get 200 "api-key/count")))
      (t2.with-temp/with-temp
          [:model/ApiKey _ {:unhashed_key "some_other_key"
                            :name         "my cool OTHER name"
                            :user_id      (mt/user->id :crowberto)
                            :created_by   (mt/user->id :crowberto)}]
        (is (= 2 (mt/user-http-request :crowberto :get 200 "api-key/count")))))))

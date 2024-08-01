(ns metabase-enterprise.scim.api-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.scim.api :as scim]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- scim-api-key-shape
  "Expected shape of a SCIM API key, to be used in =? assertions."
  [test-user]
  {:name          #"Metabase SCIM API Key .*"
   :scope         (mt/malli=?
                   [:enum :scim "scim"])
   :key           (mt/malli=? :string)
   :unmasked_key  (mt/malli=? :string)
   :user_id       nil
   :creator_id    (mt/user->id test-user)
   :updated_by_id (mt/user->id test-user)})

(deftest refresh-scim-api-key!-test
  (testing "Can create a new SCIM API key"
    (t2/delete! :model/ApiKey :scope :scim)
    (let [key1 (#'scim/refresh-scim-api-key! (mt/user->id :crowberto))]
      (is (=? (scim-api-key-shape :crowberto) key1))

      (testing "The same function will refresh an existing SCIM API key"
        (let [key2 (#'scim/refresh-scim-api-key! (mt/user->id :crowberto))]
          (is (=? (scim-api-key-shape :crowberto) key2))
         (is (not= (:key key1) (:key key2)))
         (is (= 1 (t2/count :model/ApiKey :scope :scim))))))))

(deftest get-api-key-test
  (testing "GET /api/ee/scim/api_key"
    (mt/with-premium-features #{:scim}
      (testing "Can fetch a SCIM API key"
        (let [actual-key  (#'scim/refresh-scim-api-key! (mt/user->id :crowberto))
              fetched-key (mt/user-http-request :crowberto :get 200 "ee/scim/api_key")]
          (is (nil? (:unmasked_key fetched-key)))
          (is (= (:key actual-key) (:key fetched-key)))))

      (testing "A non-admin cannot fetch the SCIM API key"
        (mt/user-http-request :rasta :get 403 "ee/scim/api_key"))

      (testing "A 404 is returned if the key has not yet been created"
        (t2/delete! :model/ApiKey :scope :scim)
        (mt/user-http-request :crowberto :get 404 "ee/scim/api_key")))))

(deftest post-api-key-test
  (testing "POST /api/ee/scim/api_key"
    (mt/with-premium-features #{:scim}
      (testing "Can create a new SCIM API key"
        (let [key1 (mt/user-http-request :crowberto :post 200 "ee/scim/api_key")]
          (is (=? (scim-api-key-shape :crowberto) key1))

          (testing "Can refresh an API key"
            (let [key2 (mt/user-http-request :crowberto :post 200 "ee/scim/api_key")]
              (is (=? (scim-api-key-shape :crowberto) key2))
              (is (not= key1 key2))))))

      (testing "A non-admin cannot create a SCIM API key"
        (mt/user-http-request :rasta :post 403 "ee/scim/api_key"))

      (testing "Users and Groups have entity IDs backfilled when a new SCIM key is generated"
        (mt/with-temp [:model/User             user {:entity_id nil}
                       :model/PermissionsGroup group {:entity_id nil}]
          (mt/user-http-request :crowberto :post 200 "ee/scim/api_key")
          (is (not (nil? (t2/select-one-fn :entity_id :model/User :id (:id user)))))
          (is (not (nil? (t2/select-one-fn :entity_id :model/PermissionsGroup :id (:id group))))))))))

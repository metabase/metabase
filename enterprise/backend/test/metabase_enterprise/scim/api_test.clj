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
    (let [key1 (#'scim/refresh-scim-api-key! (mt/user->id :rasta))]
      (is (=? (scim-api-key-shape :rasta) key1))

      (testing "The same function will refresh an existing SCIM API key"
        (let [key2 (#'scim/refresh-scim-api-key! (mt/user->id :rasta))]
          (is (=? (scim-api-key-shape :rasta) key2))
         (is (not= (:key key1) (:key key2)))
         (is (= 1 (t2/count :model/ApiKey :scope :scim))))))))

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
        (mt/user-http-request :rasta :post 403 "ee/scim/api_key")))))

(deftest delete-api-key-test
  (testing "DELETE /api/ee/scim/api_key"
    (mt/with-premium-features #{:scim}
      (testing "An admin can delete the SCIM API key, thereby disabling SCIM"
        (mt/user-http-request :crowberto :post 200 "ee/scim/api_key")
        (is (= 1 (t2/count :model/ApiKey :scope :scim)))
        (mt/user-http-request :crowberto :delete 200 "ee/scim/api_key")
        (is (= 0 (t2/count :model/ApiKey :scope :scim))))

      (testing "A non-admin cannot delete the SCIM API key"
        (mt/user-http-request :rasta :delete 403 "ee/scim/api_key")))))

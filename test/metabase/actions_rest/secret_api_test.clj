(ns metabase.actions-rest.secret-api-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- secret-body
  "The body that creates a secret named `secret-name`."
  [secret-name]
  {:name          secret-name
   :value         "token-123"
   :allowed_hosts ["API.example.com " "api.example.com" "hooks.example.com"]})

(deftest create-secret-test
  (mt/with-model-cleanup [:model/ActionSecret]
    (testing "a created secret is returned with its creator and normalized hosts, and without its value"
      (let [created (mt/user-http-request :crowberto :post 200 "action-secret" (secret-body "crm_token"))]
        (is (=? {:name          "crm_token"
                 :allowed_hosts ["api.example.com" "hooks.example.com"]
                 :creator       {:id (mt/user->id :crowberto)}}
                created))
        (is (not (contains? created :value)))
        (is (= "token-123" (t2/select-one-fn :value [:model/ActionSecret :value] :id (:id created))))))
    (testing "a second secret with the same name is a 400"
      (is (= "A secret named crm_token already exists."
             (mt/user-http-request :crowberto :post 400 "action-secret" (secret-body "crm_token")))))
    (testing "a secret needs an allowed host and a name of letters, digits and underscores"
      (mt/user-http-request :crowberto :post 400 "action-secret" (assoc (secret-body "other") :allowed_hosts []))
      (mt/user-http-request :crowberto :post 400 "action-secret" (secret-body "not.valid")))))

(deftest default-select-has-no-value-test
  (mt/with-temp [:model/ActionSecret {id :id} {:name "plain" :value "v" :allowed_hosts ["example.com"]}]
    (is (not (contains? (t2/select-one :model/ActionSecret :id id) :value)))))

(deftest list-secrets-test
  (mt/with-temp [:model/ActionSecret {id :id} {:name          "listed"
                                               :value         "v"
                                               :allowed_hosts ["example.com"]
                                               :creator_id    (mt/user->id :crowberto)}]
    (let [listed (some #(when (= id (:id %)) %) (mt/user-http-request :crowberto :get 200 "action-secret"))]
      (is (=? {:name "listed" :creator {:id (mt/user->id :crowberto)}} listed))
      (is (not (contains? listed :value))))))

(deftest get-secret-test
  (mt/with-temp [:model/ActionSecret {id :id} {:name          "fetched"
                                               :value         "v"
                                               :allowed_hosts ["example.com"]
                                               :creator_id    (mt/user->id :crowberto)}]
    (let [fetched (mt/user-http-request :crowberto :get 200 (str "action-secret/" id))]
      (is (=? {:name          "fetched"
               :allowed_hosts ["example.com"]
               :creator       {:id (mt/user->id :crowberto)}}
              fetched))
      (is (not (contains? fetched :value))))
    (mt/user-http-request :crowberto :get 404 (str "action-secret/" Integer/MAX_VALUE))
    (mt/user-http-request :rasta :get 403 (str "action-secret/" id))))

(deftest update-secret-test
  (mt/with-temp [:model/ActionSecret {id :id} {:name "old" :value "old-value" :allowed_hosts ["example.com"]}]
    (let [value (fn [] (t2/select-one-fn :value [:model/ActionSecret :value] :id id))]
      (testing "a blank value keeps the current one"
        (is (=? {:name "new" :allowed_hosts ["other.example.com"]}
                (mt/user-http-request :crowberto :put 200 (str "action-secret/" id)
                                      {:name "new" :value "" :allowed_hosts ["other.example.com"]})))
        (is (= "old-value" (value))))
      (testing "a value replaces the current one"
        (mt/user-http-request :crowberto :put 200 (str "action-secret/" id) {:value "new-value"})
        (is (= "new-value" (value)))))))

(deftest delete-secret-test
  (mt/with-temp [:model/ActionSecret {id :id} {:name "deleted" :value "v" :allowed_hosts ["example.com"]}]
    (mt/user-http-request :crowberto :delete 204 (str "action-secret/" id))
    (is (not (t2/exists? :model/ActionSecret :id id)))
    (mt/user-http-request :crowberto :delete 404 (str "action-secret/" id))))

(deftest secrets-are-admin-only-test
  (mt/with-temp [:model/ActionSecret {id :id} {:name "admin_only" :value "v" :allowed_hosts ["example.com"]}]
    (mt/user-http-request :rasta :get 403 "action-secret")
    (mt/user-http-request :rasta :post 403 "action-secret" (secret-body "rasta_token"))
    (mt/user-http-request :rasta :put 403 (str "action-secret/" id) {:value "x"})
    (mt/user-http-request :rasta :delete 403 (str "action-secret/" id))))

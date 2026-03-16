(ns metabase-enterprise.oauth-server.admin-api-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

;;; ------------------------------------------------ POST /api/ee/oauth-server/clients ----------------------------

(deftest create-client-test
  (testing "POST /api/ee/oauth-server/clients"
    (testing "creates a static client and returns it with the plaintext secret"
      (mt/with-premium-features #{:metabot-v3}
        (t2/with-transaction [_conn nil {:rollback-only true}]
          (let [response (mt/user-http-request :crowberto :post 200
                                               "ee/oauth-server/clients"
                                               {:redirect_uris ["https://example.com/callback"]
                                                :client_name   "My Test App"
                                                :grant_types   ["authorization_code"]
                                                :scopes        ["openid" "profile"]})]
            (is (=? {:id                pos-int?
                     :client_id         string?
                     :client_secret     string?
                     :redirect_uris     ["https://example.com/callback"]
                     :client_name       "My Test App"
                     :registration_type "static"}
                    response)
                "client_secret should be returned on creation")))))

    (testing "returns 400 when redirect_uris is missing"
      (mt/with-premium-features #{:metabot-v3}
        (mt/user-http-request :crowberto :post 400
                              "ee/oauth-server/clients"
                              {:client_name "No Redirects"})))

    (testing "returns 403 for non-admin user"
      (mt/with-premium-features #{:metabot-v3}
        (mt/user-http-request :rasta :post 403
                              "ee/oauth-server/clients"
                              {:redirect_uris ["https://example.com/callback"]})))

    (testing "returns 402 without feature flag"
      (mt/with-premium-features #{}
        (mt/user-http-request :crowberto :post 402
                              "ee/oauth-server/clients"
                              {:redirect_uris ["https://example.com/callback"]})))))

;;; ------------------------------------------------ GET /api/ee/oauth-server/clients -----------------------------

(deftest list-clients-test
  (testing "GET /api/ee/oauth-server/clients"
    (testing "returns list of clients without secrets"
      (mt/with-premium-features #{:metabot-v3}
        (t2/with-transaction [_conn nil {:rollback-only true}]
          (let [created (mt/user-http-request :crowberto :post 200
                                              "ee/oauth-server/clients"
                                              {:redirect_uris ["https://example.com/callback"]
                                               :client_name   "List Test"})
                clients (mt/user-http-request :crowberto :get 200
                                              "ee/oauth-server/clients")]
            (is (sequential? clients))
            (is (some (fn [c] (= (:id created) (:id c))) clients)
                "created client should appear in list")
            (is (every? (fn [c] (and (nil? (:client_secret c))
                                     (nil? (:client_secret_hash c))))
                        clients)
                "secrets and hashes must not be returned")))))

    (testing "supports registration_type filter"
      (mt/with-premium-features #{:metabot-v3}
        (t2/with-transaction [_conn nil {:rollback-only true}]
          (mt/user-http-request :crowberto :post 200
                                "ee/oauth-server/clients"
                                {:redirect_uris ["https://example.com/callback"]
                                 :client_name   "Static Client"})
          (let [clients (mt/user-http-request :crowberto :get 200
                                              "ee/oauth-server/clients"
                                              :registration_type "static")]
            (is (every? #(= "static" (:registration_type %)) clients))))))

    (testing "returns 403 for non-admin"
      (mt/with-premium-features #{:metabot-v3}
        (mt/user-http-request :rasta :get 403 "ee/oauth-server/clients")))

    (testing "returns 402 without feature flag"
      (mt/with-premium-features #{}
        (mt/user-http-request :crowberto :get 402 "ee/oauth-server/clients")))))

;;; ------------------------------------------------ GET /api/ee/oauth-server/clients/:id -------------------------

(deftest get-client-test
  (testing "GET /api/ee/oauth-server/clients/:id"
    (testing "returns single client without secret"
      (mt/with-premium-features #{:metabot-v3}
        (t2/with-transaction [_conn nil {:rollback-only true}]
          (let [created  (mt/user-http-request :crowberto :post 200
                                               "ee/oauth-server/clients"
                                               {:redirect_uris ["https://example.com/callback"]
                                                :client_name   "Get Test"})
                response (mt/user-http-request :crowberto :get 200
                                               (str "ee/oauth-server/clients/" (:id created)))]
            (is (= (:id created) (:id response)))
            (is (= (:client_id created) (:client_id response)))
            (is (nil? (:client_secret response)))
            (is (nil? (:client_secret_hash response)))))))

    (testing "returns 404 for non-existent id"
      (mt/with-premium-features #{:metabot-v3}
        (mt/user-http-request :crowberto :get 404
                              "ee/oauth-server/clients/999999")))

    (testing "returns 403 for non-admin"
      (mt/with-premium-features #{:metabot-v3}
        (mt/user-http-request :rasta :get 403
                              "ee/oauth-server/clients/1")))))

;;; ------------------------------------------------ PUT /api/ee/oauth-server/clients/:id -------------------------

(deftest update-client-test
  (testing "PUT /api/ee/oauth-server/clients/:id"
    (testing "updates client_name and redirect_uris"
      (mt/with-premium-features #{:metabot-v3}
        (t2/with-transaction [_conn nil {:rollback-only true}]
          (let [created  (mt/user-http-request :crowberto :post 200
                                               "ee/oauth-server/clients"
                                               {:redirect_uris ["https://example.com/callback"]
                                                :client_name   "Before Update"})
                response (mt/user-http-request :crowberto :put 200
                                               (str "ee/oauth-server/clients/" (:id created))
                                               {:client_name   "After Update"
                                                :redirect_uris ["https://new.example.com/callback"]})]
            (is (= "After Update" (:client_name response)))
            (is (= ["https://new.example.com/callback"] (:redirect_uris response)))
            (is (nil? (:client_secret response)))))))

    (testing "returns 404 for non-existent id"
      (mt/with-premium-features #{:metabot-v3}
        (mt/user-http-request :crowberto :put 404
                              "ee/oauth-server/clients/999999"
                              {:client_name "Nope"})))

    (testing "returns 403 for non-admin"
      (mt/with-premium-features #{:metabot-v3}
        (mt/user-http-request :rasta :put 403
                              "ee/oauth-server/clients/1"
                              {:client_name "Nope"})))))

;;; ------------------------------------------------ DELETE /api/ee/oauth-server/clients/:id ----------------------

(deftest delete-client-test
  (testing "DELETE /api/ee/oauth-server/clients/:id"
    (testing "deletes the client"
      (mt/with-premium-features #{:metabot-v3}
        (t2/with-transaction [_conn nil {:rollback-only true}]
          (let [created (mt/user-http-request :crowberto :post 200
                                              "ee/oauth-server/clients"
                                              {:redirect_uris ["https://example.com/callback"]
                                               :client_name   "Delete Me"})]
            (mt/user-http-request :crowberto :delete 204
                                  (str "ee/oauth-server/clients/" (:id created)))
            ;; Verify it's gone
            (mt/user-http-request :crowberto :get 404
                                  (str "ee/oauth-server/clients/" (:id created)))))))

    (testing "returns 404 for non-existent id"
      (mt/with-premium-features #{:metabot-v3}
        (mt/user-http-request :crowberto :delete 404
                              "ee/oauth-server/clients/999999")))

    (testing "returns 403 for non-admin"
      (mt/with-premium-features #{:metabot-v3}
        (mt/user-http-request :rasta :delete 403
                              "ee/oauth-server/clients/1")))))


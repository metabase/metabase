(ns metabase.public-sharing.validation-test
  (:require
   [clojure.test :refer :all]
   [metabase.public-sharing.validation :as validation]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]
   [metabase.util.encryption :as encryption]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------- parse-public-entity tests -------------------------------------------

(deftest parse-public-entity-test
  (let [parse #'validation/parse-public-entity]
    (testing "card paths"
      (is (= [:card "550e8400-e29b-41d4-a716-446655440000"]
             (parse "/card/550e8400-e29b-41d4-a716-446655440000")))
      (is (= [:card "550e8400-e29b-41d4-a716-446655440000"]
             (parse "/card/550e8400-e29b-41d4-a716-446655440000/query")))
      (is (= [:card "550e8400-e29b-41d4-a716-446655440000"]
             (parse "/card/550e8400-e29b-41d4-a716-446655440000/params/foo/values"))))
    (testing "dashboard paths"
      (is (= [:dashboard "550e8400-e29b-41d4-a716-446655440000"]
             (parse "/dashboard/550e8400-e29b-41d4-a716-446655440000")))
      (is (= [:dashboard "550e8400-e29b-41d4-a716-446655440000"]
             (parse "/dashboard/550e8400-e29b-41d4-a716-446655440000/dashcard/1/card/2"))))
    (testing "pivot paths"
      (is (= [:card "550e8400-e29b-41d4-a716-446655440000"]
             (parse "/pivot/card/550e8400-e29b-41d4-a716-446655440000/query")))
      (is (= [:dashboard "550e8400-e29b-41d4-a716-446655440000"]
             (parse "/pivot/dashboard/550e8400-e29b-41d4-a716-446655440000/dashcard/1/card/2"))))
    (testing "tiles paths"
      (is (= [:card "550e8400-e29b-41d4-a716-446655440000"]
             (parse "/tiles/card/550e8400-e29b-41d4-a716-446655440000/1/2/3")))
      (is (= [:dashboard "550e8400-e29b-41d4-a716-446655440000"]
             (parse "/tiles/dashboard/550e8400-e29b-41d4-a716-446655440000/dashcard/1/card/2/3/4/5"))))
    (testing "exempt paths return nil"
      (is (nil? (parse "/oembed")))
      (is (nil? (parse "/action/550e8400-e29b-41d4-a716-446655440000")))
      (is (nil? (parse "/document/550e8400-e29b-41d4-a716-446655440000")))
      (is (nil? (parse "/card/550e8400-e29b-41d4-a716-446655440000/unlock")))
      (is (nil? (parse "/dashboard/550e8400-e29b-41d4-a716-446655440000/unlock"))))))

;;; ---------------------------------------------- Middleware tests ---------------------------------------------------

(defn- shared-card-attrs []
  {:public_uuid       (str (random-uuid))
   :made_public_by_id (mt/user->id :crowberto)
   :dataset_query     {:database (mt/id)
                       :type     :query
                       :query    {:source-table (mt/id :venues)
                                  :aggregation  [[:count]]}}})

(defn- shared-dashboard-attrs []
  {:public_uuid       (str (random-uuid))
   :made_public_by_id (mt/user->id :crowberto)})

(deftest unlock-check-middleware-card-no-password-test
  (testing "Card without a password is not blocked"
    (mt/with-temp [:model/Card card (shared-card-attrs)]
      (mt/with-temporary-setting-values [enable-public-sharing true]
        (is (= 200
               (:status (client/client-full-response :get 200
                                                     (str "public/card/" (:public_uuid card))))))))))

(deftest unlock-check-middleware-card-locked-test
  (testing "Card with a password returns 403 without unlock cookie"
    (mt/with-temp [:model/Card card (shared-card-attrs)]
      (mt/with-temporary-setting-values [enable-public-sharing true]
        (t2/update! :model/Card (:id card) {:public_link_password (encryption/maybe-encrypt "secret99")})
        (let [response (client/client-full-response :get 403
                                                    (str "public/card/" (:public_uuid card)))]
          (is (= "public-link-password-required"
                 (:error_code (:body response)))))))))

(deftest unlock-check-middleware-dashboard-locked-test
  (testing "Dashboard with a password returns 403 without unlock cookie"
    (mt/with-temp [:model/Dashboard dashboard (shared-dashboard-attrs)]
      (mt/with-temporary-setting-values [enable-public-sharing true]
        (t2/update! :model/Dashboard (:id dashboard) {:public_link_password (encryption/maybe-encrypt "secret99")})
        (let [response (client/client-full-response :get 403
                                                    (str "public/dashboard/" (:public_uuid dashboard)))]
          (is (= "public-link-password-required"
                 (:error_code (:body response)))))))))

;;; ---------------------------------------------- Unlock endpoint tests -----------------------------------------------

(deftest unlock-card-endpoint-test
  (testing "POST /api/public/card/:uuid/unlock"
    (mt/with-temp [:model/Card card (shared-card-attrs)]
      (mt/with-temporary-setting-values [enable-public-sharing true]
        (t2/update! :model/Card (:id card) {:public_link_password (encryption/maybe-encrypt "correct-pw")})
        (let [uuid (:public_uuid card)]
          (testing "correct password returns 200 with Set-Cookie"
            (let [response (client/client-full-response :post 200
                                                        (str "public/card/" uuid "/unlock")
                                                        {:password "correct-pw"})]
              (is (get-in response [:headers "Set-Cookie"]))
              (is (true? (get-in response [:body :success])))))
          (testing "incorrect password returns 403"
            (client/client :post 403
                           (str "public/card/" uuid "/unlock")
                           {:password "wrong-pw"})))))))

(deftest unlock-dashboard-endpoint-test
  (testing "POST /api/public/dashboard/:uuid/unlock"
    (mt/with-temp [:model/Dashboard dashboard (shared-dashboard-attrs)]
      (mt/with-temporary-setting-values [enable-public-sharing true]
        (t2/update! :model/Dashboard (:id dashboard) {:public_link_password (encryption/maybe-encrypt "dash-pw")})
        (let [uuid (:public_uuid dashboard)]
          (testing "correct password returns 200 with Set-Cookie"
            (let [response (client/client-full-response :post 200
                                                        (str "public/dashboard/" uuid "/unlock")
                                                        {:password "dash-pw"})]
              (is (get-in response [:headers "Set-Cookie"]))
              (is (true? (get-in response [:body :success])))))
          (testing "incorrect password returns 403"
            (client/client :post 403
                           (str "public/dashboard/" uuid "/unlock")
                           {:password "wrong-pw"})))))))

(deftest unlock-nonexistent-entity-test
  (testing "unlock endpoint returns 404 for nonexistent entity"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (client/client :post 404
                     (str "public/card/" (random-uuid) "/unlock")
                     {:password "any"}))))

(deftest unlock-flow-card-test
  (testing "Full flow: locked card → unlock → access with cookie"
    (mt/with-temp [:model/Card card (shared-card-attrs)]
      (mt/with-temporary-setting-values [enable-public-sharing true]
        (t2/update! :model/Card (:id card) {:public_link_password (encryption/maybe-encrypt "pw123")})
        (let [uuid (:public_uuid card)]
          ;; Step 1: blocked without cookie
          (client/client :get 403 (str "public/card/" uuid))
          ;; Step 2: unlock
          (let [unlock-resp (client/client-full-response :post 200
                                                         (str "public/card/" uuid "/unlock")
                                                         {:password "pw123"})
                set-cookie  (get-in unlock-resp [:headers "Set-Cookie"])
                ;; Set-Cookie may be a string or a seq of strings
                set-cookie  (if (string? set-cookie) set-cookie (first set-cookie))
                ;; Extract cookie value from Set-Cookie header
                cookie-val  (second (re-find #"metabase\.PUBLIC_UNLOCK=([^;]+)" set-cookie))]
            ;; Step 3: access with cookie
            (is (some? cookie-val))
            (let [response (client/client-full-response :get 200
                                                        (str "public/card/" uuid)
                                                        {:request-options
                                                         {:headers {"cookie" (str "metabase.PUBLIC_UNLOCK=" cookie-val)}}})]
              (is (= 200 (:status response))))))))))

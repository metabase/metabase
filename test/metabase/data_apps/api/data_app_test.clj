(ns metabase.data-apps.api.data-app-test
  "Tests for /api/data-app endpoints"
  (:require
   [clojure.test :refer :all]
   [metabase.api.macros :as api.macros]
   [metabase.data-apps.models :as data-apps.models]
   [metabase.data-apps.test-util :as data-apps.tu]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]
   [toucan2.core :as t2]))

;;; ------------------------------------------------ Test Helpers ------------------------------------------------

;;; ---------------------------------------- Comprehensive CRUD Flow Test -----------------------------------------

(deftest comprehensive-crud-flow-test
  (testing "Complete CRUD flow for data apps including definition and release"
    (data-apps.tu/with-data-app-cleanup
      (mt/with-test-user :crowberto
        (let [create-response (mt/user-http-request :crowberto :post 200 (data-apps.tu/data-app-url)
                                                    {:name "My Data App"
                                                     :url "/my-data-app"
                                                     :description "A comprehensive test app"})
              app-id (:id create-response)]
          (testing "Create returns expected fields"
            (is (=? {:id   (mt/malli=? pos-int?)
                     :name "My Data App"
                     :url "/my-data-app"
                     :description "A comprehensive test app"
                     :creator_id (mt/user->id :crowberto)}
                    create-response)))

          (testing "Update app fields"
            (let [update-response (mt/user-http-request :crowberto :put 200 (data-apps.tu/data-app-url app-id)
                                                        {:name "Updated Data App"
                                                         :url "/updated-data-app"
                                                         :description "Updated description"})]
              (is (=? {:name "Updated Data App"
                       :url "/updated-data-app"
                       :description "Updated description"}
                      update-response))))

          (testing "Add definition to app"
            (let [definition          {:config data-apps.tu/default-app-definition-config}
                  definition-response (mt/user-http-request :crowberto :put 200 (data-apps.tu/data-app-url app-id "/definition")
                                                            definition)]
              (is (=? {:app_id          app-id
                       :config          data-apps.tu/default-app-definition-config
                       :revision_number 1}
                      definition-response))

              (testing "fetching the app will return the latest definition"
                (is (=? {:definition {:config (:config definition)
                                      :revision_number 1}}
                        (mt/user-http-request :crowberto :get 200 (data-apps.tu/data-app-url app-id))))))

            (testing "Add second definition version"
              (let [new-config          {:actions    []
                                         :parameters []
                                         :pages      [{:name "New page"}]}
                    definition-response (mt/user-http-request :crowberto :put 200 (data-apps.tu/data-app-url app-id "/definition")
                                                              {:config new-config})]
                (is (=? {:app_id          app-id
                         :config          new-config
                         :revision_number 2}
                        definition-response))

                (testing "fetching the app will return the latest definition"
                  (is (=? {:definition {:config          new-config
                                        :revision_number 2}}
                          (mt/user-http-request :crowberto :get 200 (data-apps.tu/data-app-url app-id)))))

                (testing "Release latest definition"
                  (let [release-response (mt/user-http-request :crowberto :post 200 (data-apps.tu/data-app-url app-id "/release"))]
                    (is (=? {:app_definition_id (:id definition-response)
                             :released_at       (mt/malli=? some?)
                             :retracted         false}
                            release-response))

                    (let [app-with-release (mt/user-http-request :crowberto :get 200 (data-apps.tu/data-app-url app-id))]
                      (is (=? {:release {:app_id app-id}}
                              app-with-release))))))))

          #_(testing "Soft delete sets status to archived"
              (mt/user-http-request :crowberto :delete 204 (data-apps.tu/data-app-url app-id))
              (let [archived-app (t2/select-one :model/DataApp app-id)]
                (is (=? {:status :archived}
                        archived-app)))))))))

;;; ---------------------------------------- Definition and Release Flow -----------------------------------------

(deftest definition-and-release-flow-test
  (testing "Definition creation and release flow"
    (data-apps.tu/with-data-app-cleanup
      (data-apps.tu/with-data-app
        [app {:data-app {:name "Definition Test App"
                         :url "/definition-test"}}]
        (mt/with-test-user :crowberto
          ;; Add first definition
          (testing "Create first definition"
            (let [def1 (mt/user-http-request :crowberto :put 200
                                             (data-apps.tu/data-app-url (:id app) "/definition")
                                             {:config {:actions [] :parameters [] :pages [{:name "Page 1"}]}})]
              (is (= 1 (:revision def1)))
              (is (= {:actions [] :parameters [] :pages [{:name "Page 1"}]} (:config def1)))))

          ;; Add second definition
          (testing "Create second definition increments revision"
            (let [def2 (mt/user-http-request :crowberto :put 200
                                             (data-apps.tu/data-app-url (:id app) "/definition")
                                             {:config {:actions [] :parameters [] :pages [{:name "Page 2"}]}})]
              (is (= 2 (:revision def2)))
              (is (= {:actions [] :parameters [] :pages [{:name "Page 2"}]} (:config def2)))))

          ;; Release latest definition
          (testing "Release latest definition"
            (let [release (mt/user-http-request :crowberto :post 200
                                                (data-apps.tu/data-app-url (:id app) "/release")
                                                {})
                  app-with-release (mt/user-http-request :crowberto :get 200
                                                         (data-apps.tu/data-app-url (:id app)))]
              (is (= 2 (:definition_revision release)))
              (is (= 2 (get-in app-with-release [:release :definition_revision]))))))))))

;;; ---------------------------------------- Permissions/Authorization Tests -------------------------------------

(deftest permissions-authorization-test
  (testing "API endpoint permissions"
    (data-apps.tu/with-data-app-cleanup
      (data-apps.tu/with-data-app
        [app {:data-app {:name "Permissions Test App"}}]

        (testing "Unauthenticated access fails"
          (is (= 401 (:status (client/client :get 401 (data-apps.tu/data-app-url)))))
          (is (= 401 (:status (client/client :get 401 (data-apps.tu/data-app-url (:id app))))))
          (is (= 401 (:status (client/client :post 401 (data-apps.tu/data-app-url)
                                             {:name "test" :url "/test"})))))

        (testing "Non-admin users cannot create apps"
          (is (= 403 (:status (mt/user-http-request :rasta :post 403 (data-apps.tu/data-app-url)
                                                    {:name "test" :url "/test"})))))

        (testing "Non-admin users cannot update apps"
          (is (= 403 (:status (mt/user-http-request :rasta :put 403 (data-apps.tu/data-app-url (:id app))
                                                    {:name "updated"})))))

        (testing "Non-admin users cannot delete apps"
          (is (= 403 (:status (mt/user-http-request :rasta :delete 403 (data-apps.tu/data-app-url (:id app)))))))

        (testing "Non-admin users can read apps"
          (is (= 200 (:status (mt/user-http-request :rasta :get 200 (data-apps.tu/data-app-url)))))
          (is (= 200 (:status (mt/user-http-request :rasta :get 200 (data-apps.tu/data-app-url (:id app)))))))))))

;;; ---------------------------------------- Validation Error Tests ----------------------------------------------

(deftest validation-error-test
  (testing "API validation errors"
    (data-apps.tu/with-data-app-cleanup
      (mt/with-test-user :crowberto

        (testing "Create app with missing required fields"
          (testing "Missing name"
            (is (= 400 (:status (mt/user-http-request :crowberto :post 400 (data-apps.tu/data-app-url)
                                                      {:url "/test"})))))

          (testing "Missing url"
            (is (= 400 (:status (mt/user-http-request :crowberto :post 400 (data-apps.tu/data-app-url)
                                                      {:name "Test App"})))))

          (testing "Empty request body"
            (is (= 400 (:status (mt/user-http-request :crowberto :post 400 (data-apps.tu/data-app-url) {}))))))

        (testing "Create app with blank strings"
          (testing "Blank name"
            (is (= 400 (:status (mt/user-http-request :crowberto :post 400 (data-apps.tu/data-app-url)
                                                      {:name "" :url "/test"})))))

          (testing "Blank url"
            (is (= 400 (:status (mt/user-http-request :crowberto :post 400 (data-apps.tu/data-app-url)
                                                      {:name "Test" :url ""})))))

          (testing "Whitespace-only name"
            (is (= 400 (:status (mt/user-http-request :crowberto :post 400 (data-apps.tu/data-app-url)
                                                      {:name "   " :url "/test"}))))))))))

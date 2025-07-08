(ns metabase.data-apps.api.data-app-test
  "Tests for /api/data-app endpoints"
  (:require
   [clojure.test :refer :all]
   [metabase.data-apps.test-util :as data-apps.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest comprehensive-crud-flow-test
  (testing "Complete CRUD flow for data apps including definition and release"
    (data-apps.tu/with-data-app-cleanup!
      (mt/with-test-user :crowberto
        (let [create-response (mt/user-http-request :crowberto :post 200 (data-apps.tu/data-app-url)
                                                    {:name        "My Data App"
                                                     :slug        "/my-data-app"
                                                     :description "A comprehensive test app"})
              app-id (:id create-response)]
          (testing "Create returns expected fields"
            (is (=? {:id          (mt/malli=? pos-int?)
                     :name        "My Data App"
                     :slug        "/my-data-app"
                     :description "A comprehensive test app"
                     :creator_id  (mt/user->id :crowberto)}
                    create-response)))

          (testing "Update app fields"
            (let [update-response (mt/user-http-request :crowberto :put 200 (data-apps.tu/data-app-url app-id)
                                                        {:name        "Updated Data App"
                                                         :slug        "/updated-data-app"
                                                         :description "Updated description"})]
              (is (=? {:name        "Updated Data App"
                       :slug        "/updated-data-app"
                       :description "Updated description"}
                      update-response))))

          (testing "Add definition to app"
            (let [definition {:config data-apps.tu/default-app-definition-config}
                  definition-response (mt/user-http-request :crowberto :put 200 (data-apps.tu/data-app-url app-id "/definition")
                                                            definition)]
              (is (=? {:app_id app-id
                       :config data-apps.tu/default-app-definition-config
                       :revision_number 1}
                      definition-response))

              (testing "fetching the app will return the latest definition"
                (is (=? {:definition {:config (:config definition)
                                      :revision_number 1}}
                        (mt/user-http-request :crowberto :get 200 (data-apps.tu/data-app-url app-id))))))

            (testing "Add second definition version"
              (let [new-config {:actions []
                                :parameters []
                                :pages [{:name "New page"}]}
                    definition-response (mt/user-http-request :crowberto :put 200 (data-apps.tu/data-app-url app-id "/definition")
                                                              {:config new-config})]
                (is (=? {:app_id app-id
                         :config new-config
                         :revision_number 2}
                        definition-response))

                (testing "fetching the app will return the latest definition"
                  (is (=? {:definition {:config new-config
                                        :revision_number 2}}
                          (mt/user-http-request :crowberto :get 200 (data-apps.tu/data-app-url app-id)))))

                (testing "Release latest definition"
                  (let [release-response (mt/user-http-request :crowberto :post 200 (data-apps.tu/data-app-url app-id "/release"))]
                    (is (=? {:app_definition_id (:id definition-response)
                             :released_at (mt/malli=? some?)
                             :retracted false}
                            release-response))

                    (let [app-with-release (mt/user-http-request :crowberto :get 200 (data-apps.tu/data-app-url app-id))]
                      (is (=? {:release {:app_definition_id (:id definition-response)
                                         :retracted false}}
                              app-with-release))))))))

          (testing "Soft delete sets status to archived"
            (mt/user-http-request :crowberto :delete 204 (data-apps.tu/data-app-url app-id))
            (let [archived-app (t2/select-one :model/DataApp app-id)]
              (is (=? {:status :archived}
                      archived-app)))))))))

(deftest definition-validation-test
  (testing "Validation of definition fields"
    (data-apps.tu/with-data-app!
      [app {}]
      (testing "Backend ignores user-provided revision_number and sets it automatically"
        (let [definition-response (mt/user-http-request :crowberto :put 200 (data-apps.tu/data-app-url (:id app) "/definition")
                                                        {:config data-apps.tu/default-app-definition-config
                                                         :revision_number 5})]
          (is (= 1 (:revision_number definition-response))))))))

(deftest multiple-releases-retraction-test
  (testing "Multiple releases with old releases being retracted"
    (data-apps.tu/with-data-app!
      [{app-id :id} {:name        "Multi Release App"
                     :slug        "/multi-release-app"
                     :description "App for testing multiple releases"}]
      (testing "Create first definition and release"
        (mt/user-http-request :crowberto :put 200 (data-apps.tu/data-app-url app-id "/definition")
                              {:config data-apps.tu/default-app-definition-config})
        (let [release1-response (mt/user-http-request :crowberto :post 200 (data-apps.tu/data-app-url app-id "/release"))]
          (is (=? {:retracted false} release1-response))

          (testing "First release is active in database"
            (let [releases (t2/select :model/DataAppRelease :app_id app-id)]
              (is (= 1 (count releases)))
              (is (false? (:retracted (first releases))))))))

      (testing "Create second definition and release"
        (let [config2 {:actions []
                       :parameters []
                       :pages [{:name "Updated page"}]}
              second-definition (mt/user-http-request :crowberto :put 200 (data-apps.tu/data-app-url app-id "/definition")
                                                      {:config config2})
              release2-response (mt/user-http-request :crowberto :post 200 (data-apps.tu/data-app-url app-id "/release"))]
          (is (=? {:retracted false} release2-response))

          (testing "Second release is active, first release is retracted"
            (let [releases (t2/select :model/DataAppRelease :app_id app-id {:order-by [[:id :asc]]})]
              (is (= 2 (count releases)))
              (is (true? (:retracted (first releases))))
              (is (false? (:retracted (second releases))))))

          (testing "Only the latest release is returned when fetching the app"
            (let [app-with-release (mt/user-http-request :crowberto :get 200 (data-apps.tu/data-app-url app-id))]
              (is (=? {:release {:retracted false
                                 :app_definition_id (:id second-definition)}
                       :definition {:revision_number 2}} app-with-release)))))))))

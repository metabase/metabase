(ns metabase.data-apps.api.data-app-test
  "Tests for /api/data-app endpoints"
  (:require
   [clojure.test :refer :all]
   [metabase.data-apps.test-util :as data-apps.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- filter-apps-by-ids
  [response app-ids]
  (assert (set? app-ids))
  (assoc response :data (sort-by :id (filter #(app-ids (:id %)) (:data response)))))

(deftest data-app-listing-test
  (testing "Listing data apps returns all non-archived apps"
    (data-apps.tu/with-data-app! [app1 {}]
      (data-apps.tu/with-data-app! [app2 {}]
        (testing "List endpoint returns both apps"
          (let [list-response     (mt/user-http-request :crowberto :get 200 (data-apps.tu/data-app-url))
                filtered-response (filter-apps-by-ids list-response #{(:id app1) (:id app2)})]
            (is (=? {:data   [{:id (:id app1)} {:id (:id app2)}]
                     :limit  nil
                     :offset nil
                     :total  (mt/malli=? pos-int?)}
                    filtered-response))))

        (testing "After archiving one app, listing returns only non-archived"
          (mt/user-http-request :crowberto :put 200 (data-apps.tu/data-app-url (:id app1) "/status") {:status :archived})
          (let [list-response     (mt/user-http-request :crowberto :get 200 (data-apps.tu/data-app-url))
                filtered-response (filter-apps-by-ids list-response #{(:id app1) (:id app2)})]
            (is (=? {:data   [{:id (:id app2)}]
                     :limit  nil
                     :offset nil
                     :total  (mt/malli=? pos-int?)}
                    filtered-response))))))))

(deftest data-app-get-test
  (testing "GET /api/data-app/:id - get specific data app"
    (testing "Get private app returns app without definition or release"
      (data-apps.tu/with-data-app!
        [app {:name "Private App" :slug "private-app" :description "A private app"}]
        (let [response (mt/user-http-request :crowberto :get 200 (data-apps.tu/data-app-url (:id app)))]
          (is (=? {:id          (:id app)
                   :name        "Private App"
                   :slug        "private-app"
                   :description "A private app"
                   :creator_id  (mt/user->id :crowberto)
                   :definition  nil
                   :release     nil}
                  response)))))

    (testing "Get app with definition returns latest definition"
      (data-apps.tu/with-data-app!
        [app {:name       "App With Definition"
              :slug       "app-with-def"
              :definition {:config data-apps.tu/default-app-definition-config}}]
        (is (=? {:id         (:id app)
                 :name       "App With Definition"
                 :slug       "app-with-def"
                 :creator_id (mt/user->id :crowberto)
                 :definition {:config          data-apps.tu/default-app-definition-config
                              :revision_number 1}
                 :release    nil}
                (mt/user-http-request :crowberto :get 200 (data-apps.tu/data-app-url (:id app)))))))

    (testing "Get released app returns definition and release info"
      (data-apps.tu/with-released-app!
        [app {:name "Released App" :slug "released-app"}]
        (is (=? {:id         (:id app)
                 :name       "Released App"
                 :slug       "released-app"
                 :creator_id (mt/user->id :crowberto)
                 :definition {:config          (mt/malli=? :map)
                              :revision_number (mt/malli=? pos-int?)}
                 :release    {:app_definition_id (mt/malli=? pos-int?)
                              :released_at       (mt/malli=? some?)}}
                (mt/user-http-request :crowberto :get 200 (data-apps.tu/data-app-url (:id app)))))))

    (testing "Get non-existent app returns 404"
      (mt/user-http-request :crowberto :get 404 (data-apps.tu/data-app-url Integer/MAX_VALUE)))))

(deftest comprehensive-crud-flow-test
  (testing "Complete CRUD flow for data apps including definition and release"
    (data-apps.tu/with-data-app-cleanup!
      (mt/with-test-user :crowberto
        (let [create-response (mt/user-http-request :crowberto :post 200 (data-apps.tu/data-app-url)
                                                    {:name        "My Data App"
                                                     :slug        "my-data-app"
                                                     :description "A comprehensive test app"})
              app-id (:id create-response)]
          (testing "Create returns expected fields"
            (is (=? {:id          (mt/malli=? pos-int?)
                     :name        "My Data App"
                     :slug        "my-data-app"
                     :description "A comprehensive test app"
                     :creator_id  (mt/user->id :crowberto)}
                    create-response)))

          (testing "Update app fields"
            (let [update-response (mt/user-http-request :crowberto :put 200 (data-apps.tu/data-app-url app-id)
                                                        {:name        "Updated Data App"
                                                         :slug        "updated-data-app"
                                                         :description "Updated description"})]
              (is (=? {:name        "Updated Data App"
                       :slug        "updated-data-app"
                       :description "Updated description"}
                      update-response))))

          (testing "Add definition to app"
            (let [config              data-apps.tu/default-app-definition-config
                  definition-response (mt/user-http-request :crowberto :put 200 (data-apps.tu/data-app-url app-id "/definition")
                                                            {:config config})]
              (is (=? {:app_id          app-id
                       :config          data-apps.tu/default-app-definition-config
                       :revision_number 1}
                      definition-response))

              (testing "fetching the app will return the latest definition"
                (is (=? {:definition {:config          config
                                      :revision_number 1}}
                        (mt/user-http-request :crowberto :get 200 (data-apps.tu/data-app-url app-id))))))

            (testing "Add second definition version"
              (let [new-config {:actions    []
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
                      (is (=? {:release {:app_definition_id (:id definition-response)}}
                              app-with-release))))))))

          (testing "Archive the status"
            (mt/user-http-request :crowberto :put 200 (data-apps.tu/data-app-url app-id "/status") {:status :archived})
            (let [archived-app (t2/select-one :model/DataApp app-id)]
              (is (=? {:status :archived}
                      archived-app))))

          (testing "Mark the app as private"
            (mt/user-http-request :crowberto :put 200 (data-apps.tu/data-app-url app-id "/status") {:status :private})
            (let [private-app (t2/select-one :model/DataApp app-id)]
              (is (=? {:status :private}
                      private-app)))))))))

(deftest definition-validation-test
  (testing "Validation of definition fields"
    (data-apps.tu/with-data-app!
      [app {}]
      (testing "Backend ignores user-provided revision_number and sets it automatically"
        (let [definition-response (mt/user-http-request :crowberto :put 200 (data-apps.tu/data-app-url (:id app) "/definition")
                                                        {:config          data-apps.tu/default-app-definition-config
                                                         :revision_number 5})]
          (is (= 1 (:revision_number definition-response))))))))

(deftest multiple-releases-retraction-test
  (testing "Multiple releases with old releases being retracted"
    (data-apps.tu/with-data-app!
      [{app-id :id} {:name        "Multi Release App"
                     :slug        "multi-release-app"
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
        (let [config2           {:actions    []
                                 :parameters []
                                 :pages      [{:name "Updated page"}]}
              second-definition (mt/user-http-request :crowberto :put 200 (data-apps.tu/data-app-url app-id "/definition")
                                                      {:config config2})]
          (mt/user-http-request :crowberto :post 200 (data-apps.tu/data-app-url app-id "/release"))
          (testing "Only the latest release is returned when fetching the app"
            (let [app-with-release (mt/user-http-request :crowberto :get 200 (data-apps.tu/data-app-url app-id))]
              (is (=? {:release    {:app_definition_id (:id second-definition)}
                       :definition {:revision_number 2}} app-with-release)))))))))

(deftest status-update-api-test
  (data-apps.tu/with-data-app!
    [app {:name       "App With Definition"
          :slug       "app-with-def"
          :definition {:config data-apps.tu/default-app-definition-config}}]
    (testing "status is disallowed when updating from PUT /api/data-app/:id"
      (mt/user-http-request :crowberto :put 400 (data-apps.tu/data-app-url (:id app)) {:status :archived}))

    (testing "can update using PUT /api/data-app/:id/status"
      (mt/user-http-request :crowberto :put 200 (data-apps.tu/data-app-url (:id app) "/status") {:status :archived})

      (testing "bad statues are ignored"
        (mt/user-http-request :crowberto :put 400 (data-apps.tu/data-app-url (:id app) "/status") {:status :bad-status})))))

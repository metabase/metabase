(ns metabase-enterprise.library.api-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.test-utils :refer [without-library]]
   [metabase.permissions.core :as perms]
   [metabase.permissions.test-util :as perms.test-util]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest create-library-endpoint-test
  (mt/with-premium-features #{:library}
    (mt/with-discard-model-updates! [:model/Collection]
      (without-library
       (testing "non-data-analysts cannot create the library"
         (mt/user-http-request :rasta :post 403 "ee/library"))
       (testing "POST /ee/library creates the Library root + Data/Metrics subcollections"
         (let [response (mt/user-http-request :crowberto :post 200 "ee/library")]
           (is (= "Library" (:name response)))
           (is (some? (t2/select-one-pk :model/Collection :type collection/library-data-collection-type)))
           (is (some? (t2/select-one-pk :model/Collection :type collection/library-metrics-collection-type)))))
       (testing "a second call rejects with 400 'Semantic layer already exists'"
         (is (= "Semantic layer already exists"
                (mt/user-http-request :crowberto :post 400 "ee/library"))))))))

(deftest get-library-test
  (mt/with-premium-features #{:library}
    (mt/with-discard-model-updates! [:model/Collection]
      (without-library
       (testing "When there is no library, returns a message but still 200"
         (let [response (mt/user-http-request :crowberto :get 200 "ee/library")]
           (is (= {:data nil} response))))
       (let [_          (collection/create-library-collection!)
             data-id    (t2/select-one-pk :model/Collection :type collection/library-data-collection-type)
             metrics-id (t2/select-one-pk :model/Collection :type collection/library-metrics-collection-type)
             response   (mt/user-http-request :crowberto :get 200 "ee/library")]
         (testing "When library exists, but no content"
           (is (= "Library" (:name response)))
           (is (= ["collection"] (:here response)))
           (is (= [] (:below response))))
         (testing "With content in the library"
           (mt/with-temp [:model/Table _ {:display_name  "Table in Data"
                                          :collection_id data-id
                                          :is_published  true}
                          :model/Card _  {:name          "Card in Metrics"
                                          :collection_id metrics-id
                                          :type          :metric}
                          :model/Card _  {:name          "Other Card in Metrics"
                                          :collection_id metrics-id
                                          :type          :metric}]
             (let [response (mt/user-http-request :crowberto :get 200 "ee/library")]
               (is (= "Library" (:name response)))
               (is (= ["metric" "table"] (:below response)))
               (is (= ["collection"] (:here response))))))
         (testing "Dashboards and questions in a Dashboards collection show up"
           (mt/with-temp [:model/Collection dashboards {:name     "Dashboards"
                                                        :type     collection/library-dashboards-collection-type
                                                        :location (str "/" (t2/select-one-pk :model/Collection :type collection/library-collection-type) "/")}
                          :model/Dashboard  _          {:collection_id (:id dashboards)}
                          :model/Card       _          {:collection_id (:id dashboards) :type :question}]
             (is (= ["card" "dashboard"] (:below (mt/user-http-request :crowberto :get 200 "ee/library")))))))))))

(deftest get-library-below-excludes-trash-test
  (mt/with-premium-features #{:library}
    (mt/with-discard-model-updates! [:model/Collection]
      (without-library
       (collection/create-library-collection!)
       (let [data-folder   (t2/select-one :model/Collection :type collection/library-data-collection-type)
             metrics-id    (t2/select-one-pk :model/Collection :type collection/library-metrics-collection-type)
             dashboards-id (t2/select-one-pk :model/Collection :type collection/library-dashboards-collection-type)
             below         #(:below (mt/user-http-request :crowberto :get 200 "ee/library"))]
         (testing "A metric in the trash doesn't count"
           (mt/with-temp [:model/Card _ {:collection_id metrics-id
                                         :type          :metric
                                         :archived      true}]
             (is (= [] (below)))))
         (testing "A dashboard in the trash doesn't count"
           (mt/with-temp [:model/Dashboard _ {:collection_id dashboards-id
                                              :archived      true}]
             (is (= [] (below)))))
         (testing "A table published into a subfolder in the trash doesn't count"
           (mt/with-temp [:model/Collection {subfolder-id :id} {:type     collection/library-data-collection-type
                                                                :location (collection/children-location data-folder)
                                                                :archived true}
                          :model/Table      _                 {:collection_id subfolder-id
                                                               :is_published  true}]
             (is (= [] (below)))))
         (testing "A published table archived by sync doesn't count"
           (mt/with-temp [:model/Table _ {:collection_id (:id data-folder)
                                          :is_published  true
                                          :archived_at   (t/offset-date-time)}]
             (is (= [] (below))))))))))

(deftest get-library-below-respects-permissions-test
  (mt/with-premium-features #{:library}
    (perms.test-util/with-restored-perms!
      (mt/with-discard-model-updates! [:model/Collection]
        (without-library
         (collection/create-library-collection!)
         (let [data-folder    (t2/select-one :model/Collection :type collection/library-data-collection-type)
               metrics-folder (t2/select-one :model/Collection :type collection/library-metrics-collection-type)
               below          (fn [user] (:below (mt/user-http-request user :get 200 "ee/library")))]
           (mt/with-temp [:model/Collection {client-a-id :id} {:type     collection/library-data-collection-type
                                                               :location (collection/children-location data-folder)}
                          :model/Table      _                 {:collection_id client-a-id
                                                               :is_published  true}
                          :model/Collection {team-a-id :id}   {:type     collection/library-metrics-collection-type
                                                               :location (collection/children-location metrics-folder)}
                          :model/Card       _                 {:collection_id team-a-id
                                                               :type          :metric}]
             ;; The subfolders inherit All Users' read from Data and Metrics: revoke it so rasta can read neither
             (perms/revoke-collection-permissions! (perms/all-users-group) client-a-id)
             (perms/revoke-collection-permissions! (perms/all-users-group) team-a-id)
             (testing "A table and a metric in collections the user can't read don't count"
               (is (= [] (below :rasta))))
             (testing "An admin sees all of them"
               (is (= ["metric" "table"] (below :crowberto))))
             (testing "Only the content of collections the user can read counts"
               (perms/grant-collection-read-permissions! (perms/all-users-group) client-a-id)
               (is (= ["table"] (below :rasta))))
             (testing "A collection the user can read counts when its parent Data folder is unreadable"
               (perms/revoke-collection-permissions! (perms/all-users-group) (:id data-folder))
               (is (= ["table"] (below :rasta)))))))))))

(deftest disallow-cross-type-collection-move-via-api-test
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/Collection data-parent    {:name "Data Parent"    :type collection/library-data-collection-type}
                   :model/Collection metrics-parent {:name "Metrics Parent" :type collection/library-metrics-collection-type}
                   :model/Collection data-child     {:name "Data Child"     :type collection/library-data-collection-type
                                                     :location (str "/" (:id data-parent) "/")}
                   :model/Collection metrics-child  {:name "Metrics Child"  :type collection/library-metrics-collection-type
                                                     :location (str "/" (:id metrics-parent) "/")}]
      (testing "Moving a library-data collection into a library-metrics parent returns 400"
        (let [response (mt/user-http-request :crowberto :put 400 (str "collection/" (:id data-child))
                                             {:parent_id (:id metrics-parent)})]
          (is (some? response))))
      (testing "Moving a library-metrics collection into a library-data parent returns 400"
        (let [response (mt/user-http-request :crowberto :put 400 (str "collection/" (:id metrics-child))
                                             {:parent_id (:id data-parent)})]
          (is (some? response)))))))

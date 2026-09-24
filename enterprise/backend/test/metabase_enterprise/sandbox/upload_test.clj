(ns ^:mb/driver-tests ^:once metabase-enterprise.sandbox.upload-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.test :as met]
   [metabase.driver :as driver]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.upload.impl-test :as upload-test]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(defonce dataset (mt/dataset-definition "sandbox_upload"
                                        [["venues"
                                          [{:field-name "name" :base-type :type/Text}]
                                          [["something"]]]]))

(deftest uploads-disabled-for-sandboxed-user-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (mt/dataset dataset
      (met/with-gtaps-for-user! :rasta {:gtaps {:venues {}}}
        (mt/with-temp [:model/Database _ {:engine driver/*driver* :details (:details (mt/db))}]
          (testing "If the user is sandboxed, creating a new upload should fail"
            (upload-test/with-uploads-enabled!
              (is (thrown-with-msg?
                   Exception
                   #"Uploads are not permitted for sandboxed users\."
                   (upload-test/do-with-uploaded-example-csv!
                    {:grant-permission? false}
                    identity)))))
          (upload-test/with-uploads-enabled!
            (doseq [verb [:metabase.upload/append :metabase.upload/replace]]
              (testing (format "If the user is sandboxed, %s should fail" (name verb))
                (is (thrown-with-msg?
                     Exception
                     #"Uploads are not permitted for sandboxed users\."
                     (upload-test/update-csv-with-defaults! verb :user-id (mt/user->id :rasta))))))))))))

(deftest based-on-upload-for-sandboxed-user-test
  ;; FIXME: Redshift is flaking on `mt/dataset` and I don't know why, so I'm excluding it temporarily
  (mt/test-drivers (disj (mt/normal-drivers-with-feature :uploads) :redshift)
    (upload-test/with-uploads-enabled!
      (mt/dataset dataset
        (mt/with-temp [:model/Collection collection     {}
                       :model/Database   {db-id :id}    {:engine driver/*driver* :details (:details (mt/db))}
                       :model/Table      {table-id :id} {:db_id     db-id
                                                         :is_upload true}
                       :model/Card       {card-id :id
                                          :as card}     {:collection_id (:id collection)
                                                         :type          :model
                                                         :dataset_query {:type     :query
                                                                         :database db-id
                                                                         :query    {:source-table table-id}}}]
          (let [get-card (fn [] (mt/user-http-request :rasta :get 200 (str "card/" card-id)))
                get-collection-item (fn []
                                      (->> (mt/user-http-request :rasta :get 200 (str "collection/" (:collection_id card) "/items?models=dataset"))
                                           :data
                                           (filter (fn [item]
                                                     (= (:id item) (:id card))))
                                           first))]
            (testing "Sanity check: if the user is not sandboxed, based_on_upload is non-nil"
              (is (= table-id
                     (:based_on_upload (get-card))
                     (:based_on_upload (get-collection-item)))))
            (testing "If the user is sandboxed, based_on_upload is nil"
              (met/with-gtaps-for-user! :rasta {:gtaps {:venues {}}}
                (is (= nil
                       (:based_on_upload (get-card))
                       (:based_on_upload (get-collection-item))))))))))))

(deftest can-upload-false-for-sandboxed-user-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (mt/dataset dataset
      (upload-test/with-uploads-enabled!
        (testing "Sanity check: an unsandboxed user with unrestricted access can upload"
          (mt/with-all-users-data-perms-graph! {(mt/id) {:view-data      :unrestricted
                                                         :create-queries :query-builder}}
            (is (true? (:can_upload (mt/user-http-request :rasta :get 200 (str "database/" (mt/id))))))))
        (met/with-gtaps-for-user! :rasta {:gtaps {:venues {}}}
          (testing "GET /api/database/:id"
            (is (false? (:can_upload (mt/user-http-request :rasta :get 200 (str "database/" (mt/id)))))))
          (testing "GET /api/database"
            (is (false? (->> (mt/user-http-request :rasta :get 200 "database")
                             :data
                             (filter #(= (mt/id) (:id %)))
                             first
                             :can_upload)))))))))

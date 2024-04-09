(ns ^:once metabase-enterprise.upload-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.test :as met]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.upload-test :as upload-test]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest create-disabled-for-sandboxed-user-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (met/with-gtaps-for-user! :rasta {:gtaps {:venues {}}}
      (is (thrown-with-msg? Exception #"Uploads are not permitted for sandboxed users\."
            (upload-test/upload-example-csv! {:grant-permission? false}))))))

(deftest update-disabled-for-sandboxed-user-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (doseq [verb [:metabase.upload/append :metabase.upload/replace]]
      (met/with-gtaps-for-user! :rasta {:gtaps {:venues {}}}
        (is (thrown-with-msg? Exception #"Uploads are not permitted for sandboxed users\."
              (upload-test/update-csv-with-defaults! verb :user-id (mt/user->id :rasta))))))))

(deftest based-on-upload-for-sandboxed-user-test
  (mt/with-temporary-setting-values [uploads-enabled true]
    ;; FIXME: Redshift is flaking on `mt/dataset` and I don't know why, so I'm excluding it temporarily
    (mt/test-drivers (disj (mt/normal-drivers-with-feature :uploads) :redshift)
      (mt/dataset (mt/dataset-definition
                   (mt/random-name)
                   ["venues"
                    [{:field-name "name" :base-type :type/Text}]
                    [["something"]]])
        (mt/with-temp [:model/Collection collection     {}
                       :model/Database   {db-id :id}    {:engine "h2"}
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

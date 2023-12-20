(ns metabase-enterprise.upload-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.test :as met]
   [metabase.test :as mt]
   [metabase.upload-test :as upload-test]))

(deftest uploads-disabled-for-sandboxed-user-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (met/with-gtaps-for-user :rasta {:gtaps {:venues {}}}
      (is (thrown-with-msg? Exception #"Uploads are not permitted for sandboxed users\."
            (upload-test/upload-example-csv! {:grant-permission? false
                                              :schema-name       "not_public"
                                              :table-prefix      "uploaded_magic_"}))))))

(deftest appends-disabled-for-sandboxed-user-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (mt/dataset (mt/dataset-definition
                 (mt/random-name)
                 ["venues"
                  [{:field-name "name" :base-type :type/Text}]
                  [["something"]]])
      (met/with-gtaps-for-user :rasta {:gtaps {:venues {}}}
          (is (thrown-with-msg? Exception #"Uploads are not permitted for sandboxed users\."
                (upload-test/append-csv-with-defaults! :user-id (mt/user->id :rasta))))))))

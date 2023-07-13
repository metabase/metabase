(ns metabase-enterprise.upload-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.test :as met]
   [metabase.api.card :as api.card]
   [metabase.test :as mt]
   [metabase.upload-test :as upload-test]))

(deftest uploads-disabled-for-sandboxed-user-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (mt/with-temporary-setting-values [uploads-enabled true]
      (met/with-gtaps-for-user :rasta {:gtaps {:venues {}}}

        (is (thrown-with-msg? Exception #"Uploads are not permitted for sandboxed users\."
                              (api.card/upload-csv!
                               1
                               "star_wars.csv"
                               (upload-test/csv-file-with ["id,ship,captain"
                                                           "1,Serenity,Malcolm Reynolds"
                                                           "2,Millennium Falcon,Han Solo"]))))))))

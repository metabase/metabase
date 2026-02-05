(ns ^:mb/upload-tests metabase.upload.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.upload.db :as upload.db]
   [toucan2.core :as t2]))

(deftest current-database-test
  (mt/with-discard-model-updates! [:model/Database]
    (testing "returns the uploads-enabled database"
      (t2/update! :model/Database :uploads_enabled true {:uploads_enabled false})
      (t2/update! :model/Database (mt/id) {:uploads_enabled true})
      (is (= (mt/id)
             (:id (upload.db/current-database)))))
    (testing "returns nil when uploads are disabled"
      (t2/update! :model/Database :uploads_enabled true {:uploads_enabled false})
      (is (nil? (upload.db/current-database))))))

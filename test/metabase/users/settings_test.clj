(ns metabase.users.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [metabase.users.settings :as users.settings]
   [toucan2.core :as t2]))

(deftest last-used-native-database-id-can-be-read-and-set
  (testing "last-used-native-database-id can be read and set"
    (mt/with-test-user :rasta
      (let [initial-value  (users.settings/last-used-native-database-id)
            existing-db-id (:id (t2/select-one :model/Database))
            wrong-db-id    -999]
        (is (nil? initial-value))
        (users.settings/last-used-native-database-id! existing-db-id)
        (is (= existing-db-id (users.settings/last-used-native-database-id)))
        (testing "returns nil if the database doesn't exist"
          (users.settings/last-used-native-database-id! wrong-db-id)
          (is (nil? (users.settings/last-used-native-database-id))))))))

(deftest last-used-native-database-id-can-be-read-and-set-2
  (testing "last-used-native-database-id should be a user-local setting"
    (is (=? {:user-local :only}
            (setting/resolve-setting :last-used-native-database-id)))
    (mt/with-temp [:model/Database {id1 :id} {:name "DB1"}
                   :model/Database {id2 :id} {:name "DB2"}]
      (mt/with-test-user :rasta
        (mt/discard-setting-changes [last-used-native-database-id]
          (users.settings/last-used-native-database-id! id1)
          (mt/with-test-user :crowberto
            (mt/discard-setting-changes [last-used-native-database-id]
              (users.settings/last-used-native-database-id! id2)
              (is (= (users.settings/last-used-native-database-id) id2))
              (mt/with-test-user :rasta
                (is (= (users.settings/last-used-native-database-id) id1))))))))))

(deftest notebook-native-preview-sidebar-width-is-user-local-test
  (testing "notebook-native-preview-sidebar-width should be a user-local setting"
    (is (=? {:user-local :only}
            (setting/resolve-setting :notebook-native-preview-sidebar-width)))))

(deftest notebook-native-preview-sidebar-width-per-user-api-test
  (testing "PUT /api/setting/notebook-native-preview-sidebar-width saves the width for the current user only"
    (letfn [(save-width! [user width]
              (mt/user-http-request user :put 204 "setting/notebook-native-preview-sidebar-width"
                                    {:value width}))
            (saved-width [user]
              (:notebook-native-preview-sidebar-width
               (mt/user-http-request user :get 200 "session/properties")))]
      (try
        (save-width! :rasta 500)
        (save-width! :crowberto 640)
        (is (= 500 (saved-width :rasta)))
        (is (= 640 (saved-width :crowberto)))
        (testing "a user who has not resized the sidebar gets no saved width"
          (is (nil? (saved-width :lucky))))
        (finally
          (save-width! :rasta nil)
          (save-width! :crowberto nil))))))

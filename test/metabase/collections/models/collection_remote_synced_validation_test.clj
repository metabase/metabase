(ns metabase.collections.models.collection-remote-synced-validation-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest remote-synced-parent-validation-test
  (testing "A remote-synced collection can only be placed in another remote-synced collection or the root collection"
    (testing "Creating a remote-synced collection in root is allowed"
      (is (some? (t2/insert! :model/Collection
                             {:name "Remote Synced Collection"
                              :type "remote-synced"}))))

    (testing "Creating a remote-synced collection inside another remote-synced collection is allowed"
      (mt/with-temp [:model/Collection parent-collection {:type "remote-synced"}]
        (is (some? (t2/insert! :model/Collection
                               {:name "Child Remote Synced Collection"
                                :type "remote-synced"
                                :location (format "/%d/" (:id parent-collection))})))))

    (testing "Creating a remote-synced collection inside a regular collection should fail"
      (mt/with-temp [:model/Collection parent-collection {}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"A remote-synced Collection can only be placed in another remote-synced Collection or the root Collection"
             (t2/insert! :model/Collection
                         {:name "Child Remote Synced Collection"
                          :type "remote-synced"
                          :location (format "/%d/" (:id parent-collection))})))))

    (testing "Moving a remote-synced collection into a regular collection should fail"
      (mt/with-temp [:model/Collection regular-parent {}
                     :model/Collection remote-synced-collection {:type "remote-synced"}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"A remote-synced Collection can only be placed in another remote-synced Collection or the root Collection"
             (t2/update! :model/Collection (:id remote-synced-collection)
                         {:location (format "/%d/" (:id regular-parent))})))))))

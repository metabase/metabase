(ns metabase-enterprise.remote-sync.permissions-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.settings :as library.settings]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- text->prose-mirror-ast
  "Convert text to a simple ProseMirror AST for document content."
  [text]
  {:type "doc"
   :content [{:type "paragraph"
              :content [{:type "text"
                         :text text}]}]})

(deftest remote-synced-permissions-with-remote-sync-type-import-test
  (testing "can_write should be false for remote-synced collection items when remote-sync-type is import"
    (mt/with-current-user (mt/user->id :rasta)
      (mt/with-temporary-setting-values [library.settings/remote-sync-type "import"]
        (mt/with-temp [:model/Collection {library-coll-id :id} {:name "Library Collection"
                                                                :type "remote-synced"}]

          (testing "Cards in remote-synced collections have can_write=false"
            (mt/with-temp [:model/Card {card-id :id} {:name "Library Card"
                                                      :collection_id library-coll-id
                                                      :dataset_query (mt/native-query {:query "SELECT 1"})}]
              (is (false? (mi/can-write? (t2/select-one :model/Card :id card-id)))
                  "Card in remote-synced collection should not be writable when remote-sync-type is import")))

          (testing "Dashboards in remote-synced collections have can_write=false"
            (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "Library Dashboard"
                                                                :collection_id library-coll-id}]
              (is (false? (mi/can-write? (t2/select-one :model/Dashboard :id dashboard-id)))
                  "Dashboard in remote-synced collection should not be writable when remote-sync-type is import")))

          (testing "Documents in remote-synced collections have can_write=false"
            (mt/with-temp [:model/Document {document-id :id} {:name "Library Document"
                                                              :document (text->prose-mirror-ast "Library content")
                                                              :collection_id library-coll-id}]
              (is (false? (mi/can-write? (t2/select-one :model/Document :id document-id)))
                  "Document in remote-synced collection should not be writable when remote-sync-type is import"))))))))

(deftest remote-synced-permissions-with-remote-sync-type-export-test
  (testing "can_write should be true for remote-synced collection items when remote-sync-type is export"
    (mt/with-current-user (mt/user->id :rasta)
      (mt/with-temporary-setting-values [library.settings/remote-sync-type "export"]
        (mt/with-temp [:model/Collection {library-coll-id :id} {:name "Library Collection"
                                                                :type "remote-synced"}]

          (testing "Cards in remote-synced collections have can_write=true"
            (mt/with-temp [:model/Card {card-id :id} {:name "Library Card"
                                                      :collection_id library-coll-id
                                                      :dataset_query (mt/native-query {:query "SELECT 1"})}]
              (is (true? (mi/can-write? (t2/select-one :model/Card :id card-id)))
                  "Card in remote-synced collection should be writable when remote-sync-type is export")))

          (testing "Dashboards in remote-synced collections have can_write=true"
            (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "Library Dashboard"
                                                                :collection_id library-coll-id}]
              (is (true? (mi/can-write? (t2/select-one :model/Dashboard :id dashboard-id)))
                  "Dashboard in remote-synced collection should be writable when remote-sync-type is export")))

          (testing "Documents in remote-synced collections have can_write=true"
            (mt/with-temp [:model/Document {document-id :id} {:name "Library Document"
                                                              :document (text->prose-mirror-ast "Library content")
                                                              :collection_id library-coll-id}]
              (is (true? (mi/can-write? (t2/select-one :model/Document :id document-id)))
                  "Document in remote-synced collection should be writable when remote-sync-type is export"))))))))

(deftest non-remote-synced-permissions-unaffected-by-remote-sync-type-test
  (testing "can_write for non-remote-synced collection items should be unaffected by remote-sync-type setting"
    (mt/with-current-user (mt/user->id :rasta)
      (mt/with-temp [:model/Collection {regular-coll-id :id} {:name "Regular Collection"
                                                              :type nil}]

        (doseq [remote-sync-setting ["import" "export"]]
          (testing (str "When remote-sync-type is " remote-sync-setting)
            (mt/with-temporary-setting-values [library.settings/remote-sync-type remote-sync-setting]

              (testing "Cards in regular collections have can_write=true"
                (mt/with-temp [:model/Card {card-id :id} {:name "Regular Card"
                                                          :collection_id regular-coll-id
                                                          :dataset_query (mt/native-query {:query "SELECT 1"})}]
                  (is (true? (mi/can-write? (t2/select-one :model/Card :id card-id)))
                      "Card in regular collection should always be writable regardless of remote-sync-type")))

              (testing "Dashboards in regular collections have can_write=true"
                (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "Regular Dashboard"
                                                                    :collection_id regular-coll-id}]
                  (is (true? (mi/can-write? (t2/select-one :model/Dashboard :id dashboard-id)))
                      "Dashboard in regular collection should always be writable regardless of remote-sync-type")))

              (testing "Documents in regular collections have can_write=true"
                (mt/with-temp [:model/Document {document-id :id} {:name "Regular Document"
                                                                  :document (text->prose-mirror-ast "Regular content")
                                                                  :collection_id regular-coll-id}]
                  (is (true? (mi/can-write? (t2/select-one :model/Document :id document-id)))
                      "Document in regular collection should always be writable regardless of remote-sync-type"))))))))))

(deftest nested-remote-synced-collection-permissions-test
  (testing "can_write for items in nested remote-synced collections should respect remote-sync-type"
    (mt/with-current-user (mt/user->id :rasta)
      (mt/with-temp [:model/Collection {parent-library-id :id} {:name "Parent Library Collection"
                                                                :type "remote-synced"}
                     :model/Collection {child-library-id :id} {:name "Child Library Collection"
                                                               :location (format "/%d/" parent-library-id)
                                                               :type "remote-synced"}]

        (testing "When remote-sync-type is import"
          (mt/with-temporary-setting-values [library.settings/remote-sync-type "import"]

            (testing "Cards in nested remote-synced collections have can_write=false"
              (mt/with-temp [:model/Card {card-id :id} {:name "Nested Library Card"
                                                        :collection_id child-library-id
                                                        :dataset_query (mt/native-query {:query "SELECT 1"})}]
                (is (false? (mi/can-write? (t2/select-one :model/Card :id card-id)))
                    "Card in nested remote-synced collection should not be writable when remote-sync-type is import")))

            (testing "Dashboards in nested remote-synced collections have can_write=false"
              (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "Nested Library Dashboard"
                                                                  :collection_id child-library-id}]
                (is (false? (mi/can-write? (t2/select-one :model/Dashboard :id dashboard-id)))
                    "Dashboard in nested remote-synced collection should not be writable when remote-sync-type is import")))

            (testing "Documents in nested remote-synced collections have can_write=false"
              (mt/with-temp [:model/Document {document-id :id} {:name "Nested Library Document"
                                                                :document (text->prose-mirror-ast "Nested library content")
                                                                :collection_id child-library-id}]
                (is (false? (mi/can-write? (t2/select-one :model/Document :id document-id)))
                    "Document in nested remote-synced collection should not be writable when remote-sync-type is import")))))

        (testing "When remote-sync-type is export"
          (mt/with-temporary-setting-values [library.settings/remote-sync-type true]

            (testing "Cards in nested remote-synced collections have can_write=true"
              (mt/with-temp [:model/Card {card-id :id} {:name "Nested Library Card"
                                                        :collection_id child-library-id
                                                        :dataset_query (mt/native-query {:query "SELECT 1"})}]
                (is (true? (mi/can-write? (t2/select-one :model/Card :id card-id)))
                    "Card in nested remote-synced collection should be writable when remote-sync-type is export")))

            (testing "Dashboards in nested remote-synced collections have can_write=true"
              (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "Nested Library Dashboard"
                                                                  :collection_id child-library-id}]
                (is (true? (mi/can-write? (t2/select-one :model/Dashboard :id dashboard-id)))
                    "Dashboard in nested remote-synced collection should be writable when remote-sync-type is export")))

            (testing "Documents in nested remote-synced collections have can_write=true"
              (mt/with-temp [:model/Document {document-id :id} {:name "Nested Library Document"
                                                                :document (text->prose-mirror-ast "Nested library content")
                                                                :collection_id child-library-id}]
                (is (true? (mi/can-write? (t2/select-one :model/Document :id document-id)))
                    "Document in nested remote-synced collection should be writable when remote-sync-type is export")))))))))

(deftest mixed-collection-types-permissions-test
  (testing "can_write behavior should differ between library and regular collections in same test"
    (mt/with-current-user (mt/user->id :rasta)
      (mt/with-temp [:model/Collection {library-coll-id :id} {:name "Library Collection"
                                                              :type "remote-synced"}
                     :model/Collection {regular-coll-id :id} {:name "Regular Collection"
                                                              :type nil}]

        (testing "When remote-sync-type is import"
          (mt/with-temporary-setting-values [library.settings/remote-sync-type "import"]

            (testing "Library items have can_write=false while regular items have can_write=true"
              (mt/with-temp [:model/Card {library-card-id :id} {:name "Library Card"
                                                                :collection_id library-coll-id
                                                                :dataset_query (mt/native-query {:query "SELECT 1"})}
                             :model/Card {regular-card-id :id} {:name "Regular Card"
                                                                :collection_id regular-coll-id
                                                                :dataset_query (mt/native-query {:query "SELECT 1"})}
                             :model/Dashboard {library-dashboard-id :id} {:name "Library Dashboard"
                                                                          :collection_id library-coll-id}
                             :model/Dashboard {regular-dashboard-id :id} {:name "Regular Dashboard"
                                                                          :collection_id regular-coll-id}
                             :model/Document {library-document-id :id} {:name "Library Document"
                                                                        :document (text->prose-mirror-ast "Library content")
                                                                        :collection_id library-coll-id}
                             :model/Document {regular-document-id :id} {:name "Regular Document"
                                                                        :document (text->prose-mirror-ast "Regular content")
                                                                        :collection_id regular-coll-id}]

                (is (false? (mi/can-write? (t2/select-one :model/Card :id library-card-id)))
                    "Library card should not be writable")
                (is (true? (mi/can-write? (t2/select-one :model/Card :id regular-card-id)))
                    "Regular card should be writable")

                (is (false? (mi/can-write? (t2/select-one :model/Dashboard :id library-dashboard-id)))
                    "Library dashboard should not be writable")
                (is (true? (mi/can-write? (t2/select-one :model/Dashboard :id regular-dashboard-id)))
                    "Regular dashboard should be writable")

                (is (false? (mi/can-write? (t2/select-one :model/Document :id library-document-id)))
                    "Library document should not be writable")
                (is (true? (mi/can-write? (t2/select-one :model/Document :id regular-document-id)))
                    "Regular document should be writable")))))))))

(deftest mixed-collection-types-permissions-superuser-test
  (testing "can_write behavior should differ between library and regular collections in same test when the user is a super user"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Collection {library-coll-id :id} {:name "Library Collection"
                                                              :type "remote-synced"}
                     :model/Collection {regular-coll-id :id} {:name "Regular Collection"
                                                              :type nil}]

        (testing "When remote-sync-type is import"
          (mt/with-temporary-setting-values [library.settings/remote-sync-type "import"]

            (testing "Library items have can_write=false while regular items have can_write=true"
              (mt/with-temp [:model/Card {library-card-id :id} {:name "Library Card"
                                                                :collection_id library-coll-id
                                                                :dataset_query (mt/native-query {:query "SELECT 1"})}
                             :model/Card {regular-card-id :id} {:name "Regular Card"
                                                                :collection_id regular-coll-id
                                                                :dataset_query (mt/native-query {:query "SELECT 1"})}
                             :model/Dashboard {library-dashboard-id :id} {:name "Library Dashboard"
                                                                          :collection_id library-coll-id}
                             :model/Dashboard {regular-dashboard-id :id} {:name "Regular Dashboard"
                                                                          :collection_id regular-coll-id}
                             :model/Document {library-document-id :id} {:name "Library Document"
                                                                        :document (text->prose-mirror-ast "Library content")
                                                                        :collection_id library-coll-id}
                             :model/Document {regular-document-id :id} {:name "Regular Document"
                                                                        :document (text->prose-mirror-ast "Regular content")
                                                                        :collection_id regular-coll-id}]

                (is (false? (mi/can-write? (t2/select-one :model/Card :id library-card-id)))
                    "Library card should not be writable")
                (is (true? (mi/can-write? (t2/select-one :model/Card :id regular-card-id)))
                    "Regular card should be writable")

                (is (false? (mi/can-write? (t2/select-one :model/Dashboard :id library-dashboard-id)))
                    "Library dashboard should not be writable")
                (is (true? (mi/can-write? (t2/select-one :model/Dashboard :id regular-dashboard-id)))
                    "Regular dashboard should be writable")

                (is (false? (mi/can-write? (t2/select-one :model/Document :id library-document-id)))
                    "Library document should not be writable")
                (is (true? (mi/can-write? (t2/select-one :model/Document :id regular-document-id)))
                    "Regular document should be writable")))))))))

(deftest remote-synced-collection-itself-permissions-test
  (testing "can_write for remote-synced collections themselves should respect remote-sync-type"

    (testing "When remote-sync-type is import"
      (mt/with-temporary-setting-values [library.settings/remote-sync-type "import"]
        (mt/with-temp [:model/Collection {library-coll-id :id} {:name "Library Collection"
                                                                :type "remote-synced"}]
          (mt/with-current-user (mt/user->id :rasta))
          (is (false? (mi/can-write? (t2/select-one :model/Collection :id library-coll-id)))
              "Library collection itself should not be writable when remote-sync-type is import"))))

    (testing "When remote-sync-type is export"
      (mt/with-temporary-setting-values [library.settings/remote-sync-type "export"]
        (mt/with-temp [:model/Collection {library-coll-id :id} {:name "Library Collection"
                                                                :type "remote-synced"}]
          (mt/with-current-user (mt/user->id :rasta)
            (is (true? (mi/can-write? (t2/select-one :model/Collection :id library-coll-id)))
                "Library collection itself should be writable when remote-sync-type is export")))))

    (testing "Regular collections are always writable regardless of remote-sync-type"
      (doseq [remote-sync-setting ["import" "export"]]
        (mt/with-temporary-setting-values [library.settings/remote-sync-type remote-sync-setting]
          (mt/with-temp [:model/Collection {regular-coll-id :id} {:name "Regular Collection"
                                                                  :type nil}]
            (mt/with-current-user (mt/user->id :rasta)
              (is (true? (mi/can-write? (t2/select-one :model/Collection :id regular-coll-id)))
                  (str "Regular collection should always be writable when remote-sync-type is " remote-sync-setting)))))))))

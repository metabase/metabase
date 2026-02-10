(ns metabase-enterprise.remote-sync.permissions-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase.collections.models.collection :as collections]
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
  (testing "can_write should be false for remote-synced collection items when remote-sync-type is read-only"
    (mt/with-current-user (mt/user->id :rasta)
      (mt/with-temporary-setting-values [settings/remote-sync-type :read-only]
        (mt/with-temp [:model/Collection {library-coll-id :id} {:name "Library Collection"
                                                                :is_remote_synced true}]
          (testing "Cards in remote-synced collections have can_write=false"
            (mt/with-temp [:model/Card {card-id :id} {:name "Library Card"
                                                      :collection_id library-coll-id
                                                      :dataset_query (mt/native-query {:query "SELECT 1"})}]
              (is (false? (mi/can-write? (t2/select-one :model/Card :id card-id)))
                  "Card in remote-synced collection should not be writable when remote-sync-type is read-only")))
          (testing "Dashboards in remote-synced collections have can_write=false"
            (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "Library Dashboard"
                                                                :collection_id library-coll-id}]
              (is (false? (mi/can-write? (t2/select-one :model/Dashboard :id dashboard-id)))
                  "Dashboard in remote-synced collection should not be writable when remote-sync-type is read-only")))
          (testing "Documents in remote-synced collections have can_write=false"
            (mt/with-temp [:model/Document {document-id :id} {:name "Library Document"
                                                              :document (text->prose-mirror-ast "Library content")
                                                              :collection_id library-coll-id}]
              (is (false? (mi/can-write? (t2/select-one :model/Document :id document-id)))
                  "Document in remote-synced collection should not be writable when remote-sync-type is read-only"))))))))

(deftest remote-synced-permissions-with-remote-sync-type-export-test
  (testing "can_write should be true for remote-synced collection items when remote-sync-type is read-write"
    (mt/with-current-user (mt/user->id :rasta)
      (mt/with-temporary-setting-values [settings/remote-sync-type :read-write]
        (mt/with-temp [:model/Collection {library-coll-id :id} {:name "Library Collection"
                                                                :is_remote_synced true}]
          (testing "Cards in remote-synced collections have can_write=true"
            (mt/with-temp [:model/Card {card-id :id} {:name "Library Card"
                                                      :collection_id library-coll-id
                                                      :dataset_query (mt/native-query {:query "SELECT 1"})}]
              (is (true? (mi/can-write? (t2/select-one :model/Card :id card-id)))
                  "Card in remote-synced collection should be writable when remote-sync-type is read-write")))
          (testing "Dashboards in remote-synced collections have can_write=true"
            (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "Library Dashboard"
                                                                :collection_id library-coll-id}]
              (is (true? (mi/can-write? (t2/select-one :model/Dashboard :id dashboard-id)))
                  "Dashboard in remote-synced collection should be writable when remote-sync-type is read-write")))
          (testing "Documents in remote-synced collections have can_write=true"
            (mt/with-temp [:model/Document {document-id :id} {:name "Library Document"
                                                              :document (text->prose-mirror-ast "Library content")
                                                              :collection_id library-coll-id}]
              (is (true? (mi/can-write? (t2/select-one :model/Document :id document-id)))
                  "Document in remote-synced collection should be writable when remote-sync-type is read-write"))))))))

(deftest non-remote-synced-permissions-unaffected-by-remote-sync-type-test
  (testing "can_write for non-remote-synced collection items should be unaffected by remote-sync-type setting"
    (mt/with-current-user (mt/user->id :rasta)
      (mt/with-temp [:model/Collection {regular-coll-id :id} {:name "Regular Collection"
                                                              :type nil}]
        (doseq [remote-sync-setting [:read-only :read-write]]
          (testing (str "When remote-sync-type is " remote-sync-setting)
            (mt/with-temporary-setting-values [settings/remote-sync-type remote-sync-setting]
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
                                                                :is_remote_synced true}
                     :model/Collection {child-library-id :id} {:name "Child Library Collection"
                                                               :location (format "/%d/" parent-library-id)
                                                               :is_remote_synced true}]
        (testing "When remote-sync-type is read-only"
          (mt/with-temporary-setting-values [settings/remote-sync-type :read-only]
            (testing "Cards in nested remote-synced collections have can_write=false"
              (mt/with-temp [:model/Card {card-id :id} {:name "Nested Library Card"
                                                        :collection_id child-library-id
                                                        :dataset_query (mt/native-query {:query "SELECT 1"})}]
                (is (false? (mi/can-write? (t2/select-one :model/Card :id card-id)))
                    "Card in nested remote-synced collection should not be writable when remote-sync-type is read-only")))
            (testing "Dashboards in nested remote-synced collections have can_write=false"
              (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "Nested Library Dashboard"
                                                                  :collection_id child-library-id}]
                (is (false? (mi/can-write? (t2/select-one :model/Dashboard :id dashboard-id)))
                    "Dashboard in nested remote-synced collection should not be writable when remote-sync-type is read-only")))
            (testing "Documents in nested remote-synced collections have can_write=false"
              (mt/with-temp [:model/Document {document-id :id} {:name "Nested Library Document"
                                                                :document (text->prose-mirror-ast "Nested library content")
                                                                :collection_id child-library-id}]
                (is (false? (mi/can-write? (t2/select-one :model/Document :id document-id)))
                    "Document in nested remote-synced collection should not be writable when remote-sync-type is read-only")))))
        (testing "When remote-sync-type is read-write"
          (mt/with-temporary-setting-values [settings/remote-sync-type :read-write]
            (testing "Cards in nested remote-synced collections have can_write=true"
              (mt/with-temp [:model/Card {card-id :id} {:name "Nested Library Card"
                                                        :collection_id child-library-id
                                                        :dataset_query (mt/native-query {:query "SELECT 1"})}]
                (is (true? (mi/can-write? (t2/select-one :model/Card :id card-id)))
                    "Card in nested remote-synced collection should be writable when remote-sync-type is read-write")))
            (testing "Dashboards in nested remote-synced collections have can_write=true"
              (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "Nested Library Dashboard"
                                                                  :collection_id child-library-id}]
                (is (true? (mi/can-write? (t2/select-one :model/Dashboard :id dashboard-id)))
                    "Dashboard in nested remote-synced collection should be writable when remote-sync-type is read-write")))
            (testing "Documents in nested remote-synced collections have can_write=true"
              (mt/with-temp [:model/Document {document-id :id} {:name "Nested Library Document"
                                                                :document (text->prose-mirror-ast "Nested library content")
                                                                :collection_id child-library-id}]
                (is (true? (mi/can-write? (t2/select-one :model/Document :id document-id)))
                    "Document in nested remote-synced collection should be writable when remote-sync-type is read-write")))))))))

(deftest mixed-collection-types-permissions-test
  (testing "can_write behavior should differ between library and regular collections in same test"
    (mt/with-current-user (mt/user->id :rasta)
      (mt/with-temp [:model/Collection {library-coll-id :id} {:name "Library Collection"
                                                              :is_remote_synced true}
                     :model/Collection {regular-coll-id :id} {:name "Regular Collection"
                                                              :type nil}]
        (testing "When remote-sync-type is read-only"
          (mt/with-temporary-setting-values [settings/remote-sync-type :read-only]
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
                                                              :is_remote_synced true}
                     :model/Collection {regular-coll-id :id} {:name "Regular Collection"
                                                              :type nil}]
        (testing "When remote-sync-type is read-only"
          (mt/with-temporary-setting-values [settings/remote-sync-type :read-only]
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
    (testing "When remote-sync-type is read-only"
      (mt/with-temporary-setting-values [settings/remote-sync-type :read-only]
        (mt/with-temp [:model/Collection {library-coll-id :id} {:name "Library Collection"
                                                                :is_remote_synced true}]
          (mt/with-current-user (mt/user->id :rasta))
          (is (false? (mi/can-write? (t2/select-one :model/Collection :id library-coll-id)))
              "Library collection itself should not be writable when remote-sync-type is read-only"))))
    (testing "When remote-sync-type is read-write"
      (mt/with-temporary-setting-values [settings/remote-sync-type :read-write]
        (mt/with-temp [:model/Collection {library-coll-id :id} {:name "Library Collection"
                                                                :is_remote_synced true}]
          (mt/with-current-user (mt/user->id :rasta)
            (is (true? (mi/can-write? (t2/select-one :model/Collection :id library-coll-id)))
                "Library collection itself should be writable when remote-sync-type is read-write")))))
    (testing "Regular collections are always writable regardless of remote-sync-type"
      (doseq [remote-sync-setting [:read-only :read-write]]
        (mt/with-temporary-setting-values [settings/remote-sync-type remote-sync-setting]
          (mt/with-temp [:model/Collection {regular-coll-id :id} {:name "Regular Collection"
                                                                  :type nil}]
            (mt/with-current-user (mt/user->id :rasta)
              (is (true? (mi/can-write? (t2/select-one :model/Collection :id regular-coll-id)))
                  (str "Regular collection should always be writable when remote-sync-type is " remote-sync-setting)))))))))

;;; ------------------------------------------------ Tenant Collection Remote Sync Tests ------------------------------------------------

(deftest tenant-collection-remote-sync-off-by-default-test
  (testing "By default, tenant collections are not remote-synced"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true
                                         settings/remote-sync-type :read-only]
        (mt/with-temp [:model/Collection {tenant-coll-id :id} {:name "Tenant Collection"
                                                               :namespace collections/shared-tenant-ns}]
          (let [tenant-coll (t2/select-one :model/Collection :id tenant-coll-id)]
            (testing "remote-synced-collection? returns false for tenant collections by default"
              (is (false? (collections/remote-synced-collection? tenant-coll))
                  "Tenant collection should NOT be remote-synced by default"))

            (testing "Tenant collections are editable by superuser by default"
              (mt/with-current-user (mt/user->id :crowberto)
                (is (true? (mi/can-write? tenant-coll))
                    "Tenant collection should be writable by superuser by default")))))))))

(deftest tenant-collection-with-is-remote-synced-flag-test
  (testing "Tenant collections with is_remote_synced=true respect remote-sync-type setting"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true
                                         settings/remote-sync-type :read-only]
        (mt/with-temp [:model/Collection {tenant-coll-id :id} {:name "Tenant Collection"
                                                               :namespace collections/shared-tenant-ns
                                                               :is_remote_synced true}]
          (let [tenant-coll (t2/select-one :model/Collection :id tenant-coll-id)]
            (testing "remote-synced-collection? returns true when is_remote_synced flag is set"
              (is (true? (collections/remote-synced-collection? tenant-coll))
                  "Tenant collection should be remote-synced when flag is set"))

            (testing "Tenant collections are NOT editable by superuser when remote-sync-type is read-only"
              (mt/with-current-user (mt/user->id :crowberto)
                (is (false? (mi/can-write? tenant-coll))
                    "Tenant collection should not be writable when remote-sync-type is read-only")))))))))

(deftest tenant-collection-with-is-remote-synced-flag-read-write-test
  (testing "Tenant collections with is_remote_synced=true are editable when remote-sync-type is read-write"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true
                                         settings/remote-sync-type :read-write]
        (mt/with-temp [:model/Collection {tenant-coll-id :id} {:name "Tenant Collection"
                                                               :namespace collections/shared-tenant-ns
                                                               :is_remote_synced true}]
          (let [tenant-coll (t2/select-one :model/Collection :id tenant-coll-id)]
            (testing "remote-synced-collection? returns true when is_remote_synced flag is set"
              (is (true? (collections/remote-synced-collection? tenant-coll))
                  "Tenant collection should be remote-synced when flag is set"))

            (testing "Tenant collections ARE editable by superuser when remote-sync-type is read-write"
              (mt/with-current-user (mt/user->id :crowberto)
                (is (true? (mi/can-write? tenant-coll))
                    "Tenant collection should be writable when remote-sync-type is read-write")))))))))

(deftest tenant-collection-nested-inherits-remote-synced-test
  (testing "Nested tenant collections inherit is_remote_synced from parent"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true
                                         settings/remote-sync-type :read-only]
        (mt/with-temp [:model/Collection {parent-tenant-id :id} {:name "Parent Tenant Collection"
                                                                 :namespace collections/shared-tenant-ns
                                                                 :is_remote_synced true}
                       :model/Collection {child-tenant-id :id} {:name "Child Tenant Collection"
                                                                :namespace collections/shared-tenant-ns
                                                                :location (format "/%d/" parent-tenant-id)
                                                                :is_remote_synced true}]
          (let [parent-coll (t2/select-one :model/Collection :id parent-tenant-id)
                child-coll (t2/select-one :model/Collection :id child-tenant-id)]
            (testing "Parent tenant collection is remote-synced"
              (is (true? (collections/remote-synced-collection? parent-coll))
                  "Parent tenant collection should be remote-synced"))

            (testing "Child tenant collection is remote-synced"
              (is (true? (collections/remote-synced-collection? child-coll))
                  "Child tenant collection should be remote-synced"))

            (testing "Parent tenant collection is not editable by superuser"
              (mt/with-current-user (mt/user->id :crowberto)
                (is (false? (mi/can-write? parent-coll))
                    "Parent tenant collection should not be writable")))

            (testing "Child tenant collection is not editable by superuser"
              (mt/with-current-user (mt/user->id :crowberto)
                (is (false? (mi/can-write? child-coll))
                    "Child tenant collection should not be writable")))))))))

(deftest tenant-collection-mixed-remote-synced-status-test
  (testing "Mixed scenario: some tenant collections remote-synced, others not"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true
                                         settings/remote-sync-type :read-only]
        (mt/with-temp [:model/Collection {remote-synced-tenant-id :id} {:name "Remote-Synced Tenant Collection"
                                                                        :namespace collections/shared-tenant-ns
                                                                        :is_remote_synced true}
                       :model/Collection {regular-tenant-id :id} {:name "Regular Tenant Collection"
                                                                  :namespace collections/shared-tenant-ns
                                                                  :is_remote_synced false}
                       :model/Collection {regular-coll-id :id} {:name "Regular Collection"}]
          (let [remote-synced-tenant (t2/select-one :model/Collection :id remote-synced-tenant-id)
                regular-tenant (t2/select-one :model/Collection :id regular-tenant-id)
                regular-coll (t2/select-one :model/Collection :id regular-coll-id)]
            (testing "Remote-synced tenant collection is remote-synced"
              (is (true? (collections/remote-synced-collection? remote-synced-tenant))
                  "Remote-synced tenant collection should be remote-synced"))

            (testing "Regular tenant collection is NOT remote-synced"
              (is (false? (collections/remote-synced-collection? regular-tenant))
                  "Regular tenant collection should NOT be remote-synced"))

            (testing "Regular collection is NOT remote-synced"
              (is (false? (collections/remote-synced-collection? regular-coll))
                  "Regular collection should NOT be remote-synced"))

            (mt/with-current-user (mt/user->id :crowberto)
              (testing "Remote-synced tenant collection is not editable by superuser"
                (is (false? (mi/can-write? remote-synced-tenant))
                    "Remote-synced tenant collection should not be writable"))

              (testing "Regular tenant collection is editable by superuser"
                (is (true? (mi/can-write? regular-tenant))
                    "Regular tenant collection should be writable"))

              (testing "Regular collection remains editable by superuser"
                (is (true? (mi/can-write? regular-coll))
                    "Regular collection should be writable")))))))))

;;; ------------------------------------------------ Table Remote Sync Tests ------------------------------------------------

(deftest table-remote-synced-permissions-read-only-test
  (testing "can_write should be false for published tables in remote-synced collections when remote-sync-type is read-only"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temporary-setting-values [settings/remote-sync-type :read-only]
        (mt/with-temp [:model/Collection {library-coll-id :id} {:name "Library Collection"
                                                                :is_remote_synced true}]
          (testing "Published tables in remote-synced collections have can_write=false"
            (t2/update! :model/Table (mt/id :venues)
                        {:is_published true
                         :collection_id library-coll-id})
            (try
              (is (false? (mi/can-write? (t2/select-one :model/Table :id (mt/id :venues))))
                  "Published table in remote-synced collection should not be writable when remote-sync-type is read-only")
              (finally
                (t2/update! :model/Table (mt/id :venues)
                            {:is_published false
                             :collection_id nil})))))))))

(deftest table-remote-synced-permissions-read-write-test
  (testing "can_write should be true for published tables in remote-synced collections when remote-sync-type is read-write"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temporary-setting-values [settings/remote-sync-type :read-write]
        (mt/with-temp [:model/Collection {library-coll-id :id} {:name "Library Collection"
                                                                :is_remote_synced true}]
          (testing "Published tables in remote-synced collections have can_write=true"
            (t2/update! :model/Table (mt/id :venues)
                        {:is_published true
                         :collection_id library-coll-id})
            (try
              (is (true? (mi/can-write? (t2/select-one :model/Table :id (mt/id :venues))))
                  "Published table in remote-synced collection should be writable when remote-sync-type is read-write")
              (finally
                (t2/update! :model/Table (mt/id :venues)
                            {:is_published false
                             :collection_id nil})))))))))

(deftest table-unpublished-in-remote-synced-collection-test
  (testing "can_write should be true for unpublished tables in remote-synced collections regardless of remote-sync-type"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temporary-setting-values [settings/remote-sync-type :read-only]
        (mt/with-temp [:model/Collection {library-coll-id :id} {:name "Library Collection"
                                                                :is_remote_synced true}]
          (testing "Unpublished tables in remote-synced collections have can_write=true"
            (t2/update! :model/Table (mt/id :venues)
                        {:is_published false
                         :collection_id library-coll-id})
            (try
              (is (true? (mi/can-write? (t2/select-one :model/Table :id (mt/id :venues))))
                  "Unpublished table in remote-synced collection should be writable even when remote-sync-type is read-only")
              (finally
                (t2/update! :model/Table (mt/id :venues)
                            {:is_published false
                             :collection_id nil})))))))))

(deftest table-regular-collection-unaffected-test
  (testing "can_write for tables in regular collections should be unaffected by remote-sync-type setting"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Collection {regular-coll-id :id} {:name "Regular Collection"
                                                              :type nil}]
        (doseq [remote-sync-setting [:read-only :read-write]]
          (testing (str "When remote-sync-type is " remote-sync-setting)
            (mt/with-temporary-setting-values [settings/remote-sync-type remote-sync-setting]
              (testing "Published tables in regular collections have can_write=true"
                (t2/update! :model/Table (mt/id :venues)
                            {:is_published true
                             :collection_id regular-coll-id})
                (try
                  (is (true? (mi/can-write? (t2/select-one :model/Table :id (mt/id :venues))))
                      "Published table in regular collection should be writable regardless of remote-sync-type")
                  (finally
                    (t2/update! :model/Table (mt/id :venues)
                                {:is_published false
                                 :collection_id nil})))))))))))

;;; ------------------------------------------------ Field Remote Sync Tests ------------------------------------------------

(deftest field-remote-synced-permissions-read-only-test
  (testing "can_write should be false for fields of published tables in remote-synced collections when remote-sync-type is read-only"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temporary-setting-values [settings/remote-sync-type :read-only]
        (mt/with-temp [:model/Collection {library-coll-id :id} {:name "Library Collection"
                                                                :is_remote_synced true}]
          (testing "Fields on published tables in remote-synced collections have can_write=false"
            (let [table-id (mt/id :venues)
                  field-id (mt/id :venues :name)]
              (t2/update! :model/Table table-id
                          {:is_published true
                           :collection_id library-coll-id})
              (try
                (is (false? (mi/can-write? (t2/select-one :model/Field :id field-id)))
                    "Field on published table in remote-synced collection should not be writable when remote-sync-type is read-only")
                (finally
                  (t2/update! :model/Table table-id
                              {:is_published false
                               :collection_id nil}))))))))))

(deftest field-remote-synced-permissions-read-write-test
  (testing "can_write should be true for fields of published tables in remote-synced collections when remote-sync-type is read-write"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temporary-setting-values [settings/remote-sync-type :read-write]
        (mt/with-temp [:model/Collection {library-coll-id :id} {:name "Library Collection"
                                                                :is_remote_synced true}]
          (testing "Fields on published tables in remote-synced collections have can_write=true"
            (let [table-id (mt/id :venues)
                  field-id (mt/id :venues :name)]
              (t2/update! :model/Table table-id
                          {:is_published true
                           :collection_id library-coll-id})
              (try
                (is (true? (mi/can-write? (t2/select-one :model/Field :id field-id)))
                    "Field on published table in remote-synced collection should be writable when remote-sync-type is read-write")
                (finally
                  (t2/update! :model/Table table-id
                              {:is_published false
                               :collection_id nil}))))))))))

;;; ------------------------------------------------ Segment Remote Sync Tests ------------------------------------------------

(deftest segment-remote-synced-permissions-read-only-test
  (testing "can_write should be false for segments of published tables in remote-synced collections when remote-sync-type is read-only"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temporary-setting-values [settings/remote-sync-type :read-only]
        (mt/with-temp [:model/Collection {library-coll-id :id} {:name "Library Collection"
                                                                :is_remote_synced true}]
          (testing "Segments on published tables in remote-synced collections have can_write=false"
            (let [table-id (mt/id :venues)]
              (t2/update! :model/Table table-id
                          {:is_published true
                           :collection_id library-coll-id})
              (try
                ;; Use empty definition {} which is valid for segments
                (mt/with-temp [:model/Segment {segment-id :id} {:name "Test Segment"
                                                                :table_id table-id
                                                                :definition {}}]
                  (is (false? (mi/can-write? (t2/select-one :model/Segment :id segment-id)))
                      "Segment on published table in remote-synced collection should not be writable when remote-sync-type is read-only"))
                (finally
                  (t2/update! :model/Table table-id
                              {:is_published false
                               :collection_id nil}))))))))))

(deftest segment-remote-synced-permissions-read-write-test
  (testing "can_write should be true for segments of published tables in remote-synced collections when remote-sync-type is read-write"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temporary-setting-values [settings/remote-sync-type :read-write]
        (mt/with-temp [:model/Collection {library-coll-id :id} {:name "Library Collection"
                                                                :is_remote_synced true}]
          (testing "Segments on published tables in remote-synced collections have can_write=true"
            (let [table-id (mt/id :venues)]
              (t2/update! :model/Table table-id
                          {:is_published true
                           :collection_id library-coll-id})
              (try
                ;; Use empty definition {} which is valid for segments
                (mt/with-temp [:model/Segment {segment-id :id} {:name "Test Segment"
                                                                :table_id table-id
                                                                :definition {}}]
                  (is (true? (mi/can-write? (t2/select-one :model/Segment :id segment-id)))
                      "Segment on published table in remote-synced collection should be writable when remote-sync-type is read-write"))
                (finally
                  (t2/update! :model/Table table-id
                              {:is_published false
                               :collection_id nil}))))))))))

(deftest segment-creation-blocked-in-read-only-mode-test
  (testing "can_create should be false for segments on published tables in remote-synced collections when remote-sync-type is read-only"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temporary-setting-values [settings/remote-sync-type :read-only]
        (mt/with-temp [:model/Collection {library-coll-id :id} {:name "Library Collection"
                                                                :is_remote_synced true}]
          (testing "Segment creation should be blocked on published tables in remote-synced collections"
            (let [table-id (mt/id :venues)]
              (t2/update! :model/Table table-id
                          {:is_published true
                           :collection_id library-coll-id})
              (try
                ;; Pass the table directly to can-create? so it uses the updated values
                (let [table (t2/select-one :model/Table :id table-id)]
                  (is (false? (mi/can-create? :model/Segment {:table_id table-id
                                                              :table table
                                                              :name "New Segment"
                                                              :definition {}}))
                      "Segment creation should be blocked on published table in remote-synced collection when remote-sync-type is read-only"))
                (finally
                  (t2/update! :model/Table table-id
                              {:is_published false
                               :collection_id nil}))))))))))

;;; ------------------------------------------------ Transform Remote Sync Tests ------------------------------------------------
;; Transforms are globally read-only when remote-sync is enabled and remote-sync-type is :read-only.
;; This is different from other models which use collection-based editability checks.

(deftest transform-superuser-can-read-test
  (testing "can_read should be true for superusers"
    (mt/with-premium-features #{:transforms}
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Transforms Collection"
                                                        :namespace :transforms}
                       :model/Transform {transform-id :id} {:name "Test Transform"
                                                            :collection_id coll-id
                                                            :source {:type "query"
                                                                     :query {:database (mt/id)
                                                                             :type :query
                                                                             :query {:source-table (mt/id :venues)}}}
                                                            :target {:database (mt/id)
                                                                     :type "table"
                                                                     :schema "public"
                                                                     :name "target_table"}}]
          (is (true? (mi/can-read? (t2/select-one :model/Transform :id transform-id)))
              "Superuser should be able to read transforms"))))))

(deftest transform-non-superuser-cannot-read-test
  (testing "can_read should be false for non-superusers"
    (mt/with-premium-features #{:transforms}
      (mt/with-current-user (mt/user->id :rasta)
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Transforms Collection"
                                                        :namespace :transforms}
                       :model/Transform {transform-id :id} {:name "Test Transform"
                                                            :collection_id coll-id
                                                            :source {:type "query"
                                                                     :query {:database (mt/id)
                                                                             :type :query
                                                                             :query {:source-table (mt/id :venues)}}}
                                                            :target {:database (mt/id)
                                                                     :type "table"
                                                                     :schema "public"
                                                                     :name "target_table"}}]
          (is (false? (mi/can-read? (t2/select-one :model/Transform :id transform-id)))
              "Non-superuser should not be able to read transforms"))))))

(deftest transform-globally-read-only-when-remote-sync-enabled-test
  (testing "can_write should be false for ALL transforms when remote-sync is enabled and type is read-only"
    (mt/with-premium-features #{:transforms}
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temporary-setting-values [settings/remote-sync-url "https://github.com/test/repo.git"
                                           settings/remote-sync-type :read-only]
          (mt/with-temp [:model/Collection {coll-id :id} {:name "Transforms Collection"
                                                          :namespace :transforms}
                         :model/Transform {transform-id :id} {:name "Test Transform"
                                                              :collection_id coll-id
                                                              :source {:type "query"
                                                                       :query {:database (mt/id)
                                                                               :type :query
                                                                               :query {:source-table (mt/id :venues)}}}
                                                              :target {:database (mt/id)
                                                                       :type "table"
                                                                       :schema "public"
                                                                       :name "target_table"}}]
            (is (false? (mi/can-write? (t2/select-one :model/Transform :id transform-id)))
                "All transforms should be read-only when remote-sync is enabled and type is read-only")))))))

(deftest transform-writable-when-remote-sync-read-write-test
  (testing "can_write should be true for transforms when remote-sync-type is read-write"
    (mt/with-premium-features #{:transforms}
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temporary-setting-values [settings/remote-sync-url "https://github.com/test/repo.git"
                                           settings/remote-sync-type :read-write]
          (mt/with-temp [:model/Collection {coll-id :id} {:name "Transforms Collection"
                                                          :namespace :transforms}
                         :model/Transform {transform-id :id} {:name "Test Transform"
                                                              :collection_id coll-id
                                                              :source {:type "query"
                                                                       :query {:database (mt/id)
                                                                               :type :query
                                                                               :query {:source-table (mt/id :venues)}}}
                                                              :target {:database (mt/id)
                                                                       :type "table"
                                                                       :schema "public"
                                                                       :name "target_table"}}]
            (is (true? (mi/can-write? (t2/select-one :model/Transform :id transform-id)))
                "Transforms should be writable when remote-sync-type is read-write")))))))

(deftest transform-writable-when-remote-sync-disabled-test
  (testing "can_write should be true for transforms when remote-sync is not enabled"
    (mt/with-premium-features #{:transforms}
      (mt/with-current-user (mt/user->id :crowberto)
        ;; remote-sync-url is not set, so remote-sync-enabled returns false
        (mt/with-temporary-setting-values [settings/remote-sync-url nil
                                           settings/remote-sync-type :read-only]
          (mt/with-temp [:model/Collection {coll-id :id} {:name "Transforms Collection"
                                                          :namespace :transforms}
                         :model/Transform {transform-id :id} {:name "Test Transform"
                                                              :collection_id coll-id
                                                              :source {:type "query"
                                                                       :query {:database (mt/id)
                                                                               :type :query
                                                                               :query {:source-table (mt/id :venues)}}}
                                                              :target {:database (mt/id)
                                                                       :type "table"
                                                                       :schema "public"
                                                                       :name "target_table"}}]
            (is (true? (mi/can-write? (t2/select-one :model/Transform :id transform-id)))
                "Transforms should be writable when remote-sync is not enabled")))))))

(deftest transform-creation-blocked-in-read-only-mode-test
  (testing "can_create should be false for transforms when remote-sync is enabled and type is read-only"
    (mt/with-premium-features #{:transforms}
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temporary-setting-values [settings/remote-sync-url "https://github.com/test/repo.git"
                                           settings/remote-sync-type :read-only]
          (mt/with-temp [:model/Collection {coll-id :id} {:name "Transforms Collection"
                                                          :namespace :transforms}]
            (is (false? (mi/can-create? :model/Transform {:name "New Transform"
                                                          :collection_id coll-id
                                                          :source {:type "query"
                                                                   :query {:database (mt/id)
                                                                           :type :query
                                                                           :query {:source-table (mt/id :venues)}}}
                                                          :target {:database (mt/id)
                                                                   :type "table"
                                                                   :schema "public"
                                                                   :name "target_table"}}))
                "Transform creation should be blocked when remote-sync is enabled and type is read-only")))))))

(deftest transform-creation-allowed-in-read-write-mode-test
  (testing "can_create should be true for transforms when remote-sync-type is read-write"
    (mt/with-premium-features #{:transforms}
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temporary-setting-values [settings/remote-sync-url "https://github.com/test/repo.git"
                                           settings/remote-sync-type :read-write]
          (mt/with-temp [:model/Collection {coll-id :id} {:name "Transforms Collection"
                                                          :namespace :transforms}]
            (is (true? (mi/can-create? :model/Transform {:name "New Transform"
                                                         :collection_id coll-id
                                                         :source {:type "query"
                                                                  :query {:database (mt/id)
                                                                          :type :query
                                                                          :query {:source-table (mt/id :venues)}}}
                                                         :target {:database (mt/id)
                                                                  :type "table"
                                                                  :schema "public"
                                                                  :name "target_table"}}))
                "Transform creation should be allowed when remote-sync-type is read-write")))))))

(deftest transform-non-superuser-cannot-write-test
  (testing "can_write should be false for non-superusers even when remote-sync-type is read-write"
    (mt/with-premium-features #{:transforms}
      (mt/with-current-user (mt/user->id :rasta)
        (mt/with-temporary-setting-values [settings/remote-sync-type :read-write]
          (mt/with-temp [:model/Collection {coll-id :id} {:name "Transforms Collection"
                                                          :namespace :transforms}
                         :model/Transform {transform-id :id} {:name "Test Transform"
                                                              :collection_id coll-id
                                                              :source {:type "query"
                                                                       :query {:database (mt/id)
                                                                               :type :query
                                                                               :query {:source-table (mt/id :venues)}}}
                                                              :target {:database (mt/id)
                                                                       :type "table"
                                                                       :schema "public"
                                                                       :name "target_table"}}]
            (is (false? (mi/can-write? (t2/select-one :model/Transform :id transform-id)))
                "Non-superuser should not be able to write transforms even when remote-sync-type is read-write")))))))

(deftest transform-non-superuser-cannot-create-test
  (testing "can_create should be false for non-superusers even when remote-sync-type is read-write"
    (mt/with-premium-features #{:transforms}
      (mt/with-current-user (mt/user->id :rasta)
        (mt/with-temporary-setting-values [settings/remote-sync-type :read-write]
          (mt/with-temp [:model/Collection {coll-id :id} {:name "Transforms Collection"
                                                          :namespace :transforms}]
            (is (false? (mi/can-create? :model/Transform {:name "New Transform"
                                                          :collection_id coll-id
                                                          :source {:type "query"
                                                                   :query {:database (mt/id)
                                                                           :type :query
                                                                           :query {:source-table (mt/id :venues)}}}
                                                          :target {:database (mt/id)
                                                                   :type "table"
                                                                   :schema "public"
                                                                   :name "target_table"}}))
                "Non-superuser should not be able to create transforms even when remote-sync-type is read-write")))))))

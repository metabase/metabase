(ns ^:mb/driver-tests metabase-enterprise.data-studio.api.table-test
  "Tests for /api/ee/data-studio/table endpoints."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-studio.api.table :as api.table]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.test-utils :refer [without-library]]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2])
  (:import (java.util.concurrent CountDownLatch TimeUnit)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest publish-table-test
  (mt/with-premium-features #{:data-studio :audit-app}
    (without-library
     (testing "POST /api/ee/data-studio/table/(un)publish-table"
       (testing "publishes tables into the library-data collection"
         (mt/with-temp [:model/Collection {collection-id :id} {:type collection/library-data-collection-type}]
           (testing "normal users are not allowed to publish"
             (mt/user-http-request :rasta :post 403 "ee/data-studio/table/publish-tables"
                                   {:table_ids [(mt/id :users) (mt/id :venues)]}))
           (let [response (mt/user-http-request :crowberto :post 200 "ee/data-studio/table/publish-tables"
                                                {:table_ids [(mt/id :users) (mt/id :venues)]})]
             (is (=? {:id collection-id} (:target_collection response)))
             (testing "collection_id and is_published are set"
               (is (=? [{:display_name "Users"
                         :collection_id collection-id
                         :is_published true}
                        {:display_name "Venues"
                         :collection_id collection-id
                         :is_published true}]
                       (t2/select :model/Table :id [:in [(mt/id :users) (mt/id :venues)]] {:order-by [:display_name]}))))
             (testing "audit log entries are created for publish"
               (is (=? {:topic :table-publish, :model "Table", :model_id (mt/id :users)}
                       (mt/latest-audit-log-entry "table-publish" (mt/id :users))))
               (is (=? {:topic :table-publish, :model "Table", :model_id (mt/id :venues)}
                       (mt/latest-audit-log-entry "table-publish" (mt/id :venues)))))
             (testing "unpublishing"
               (testing "normal users are not allowed"
                 (mt/user-http-request :rasta :post 403 "ee/data-studio/table/unpublish-tables"
                                       {:table_ids [(mt/id :venues)]}))
               (mt/user-http-request :crowberto :post 204 "ee/data-studio/table/unpublish-tables"
                                     {:table_ids [(mt/id :venues)]})
               (is (=? {:display_name "Venues"
                        :collection_id nil
                        :is_published false}
                       (t2/select-one :model/Table (mt/id :venues))))
               (testing "audit log entry is created for unpublish"
                 (is (=? {:topic :table-unpublish, :model "Table", :model_id (mt/id :venues)}
                         (mt/latest-audit-log-entry "table-unpublish" (mt/id :venues)))))))))
       (testing "deleting the collection unpublishes"
         (is (=? {:display_name "Users"
                  :collection_id nil
                  :is_published false}
                 (t2/select-one :model/Table (mt/id :users))))))
     (testing "returns 404 when no library-data collection exists"
       (is (= "Not found."
              (mt/user-http-request :crowberto :post 404 "ee/data-studio/table/publish-tables"
                                    {:table_ids [(mt/id :users)]}))))
     (testing "returns 409 when multiple library-data collections exist"
       (mt/with-temp [:model/Collection _ {:type collection/library-data-collection-type}
                      :model/Collection _ {:type collection/library-data-collection-type}]
         (is (= "Multiple library-data collections found."
                (mt/user-http-request :crowberto :post 409 "ee/data-studio/table/publish-tables"
                                      {:table_ids [(mt/id :users)]}))))))))

(deftest bulk-edit-visibility-sync-test
  (mt/with-premium-features #{:data-studio}
    (testing "POST /api/ee/data-studio/table/edit visibility field synchronization"
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/Table    {table-1-id :id} {:db_id db-id}
                     :model/Table    {table-2-id :id} {:db_id db-id}]

        (testing "updating data_layer syncs to visibility_type for all tables"
        ;; Update two tables to internal, which should sync to nil visibility_type
          (mt/user-http-request :crowberto :post 200 "ee/data-studio/table/edit"
                                {:table_ids  [table-1-id table-2-id]
                                 :data_layer "internal"})
          (is (= :internal (t2/select-one-fn :data_layer :model/Table :id table-1-id)))
          (is (= nil (t2/select-one-fn :visibility_type :model/Table :id table-1-id)))
          (is (= :internal (t2/select-one-fn :data_layer :model/Table :id table-2-id)))
          (is (= nil (t2/select-one-fn :visibility_type :model/Table :id table-2-id))))

        (testing "updating data_layer to hidden syncs to hidden visibility_type"
        ;; Update one table back to hidden, which should sync to :hidden
          (mt/user-http-request :crowberto :post 200 "ee/data-studio/table/edit"
                                {:table_ids  [table-1-id]
                                 :data_layer "hidden"})
          (is (= :hidden (t2/select-one-fn :data_layer :model/Table :id table-1-id)))
          (is (= :hidden (t2/select-one-fn :visibility_type :model/Table :id table-1-id))))

        (testing "cannot update both visibility_type and data_layer at once"
          (mt/user-http-request :crowberto :post 400 "ee/data-studio/table/edit"
                                {:table_ids        [table-1-id]
                                 :visibility_type  "hidden"
                                 :data_layer       "hidden"}))))))

(deftest requests-data-studio-feature-flag-test
  (mt/with-premium-features #{}
    (is (= "Data Studio is a paid feature not currently available to your instance. Please upgrade to use it. Learn more at metabase.com/upgrade/"
           (:message (mt/user-http-request :crowberto :post 402 "ee/data-studio/table/edit"
                                           {:table_ids  [(mt/id :users)]
                                            :data_layer "gold"}))))))

(deftest data-analyst-can-access-endpoints-test
  (mt/with-premium-features #{:data-studio}
    (testing "Data analysts (members of Data Analysts group) can access data studio endpoints"
      (let [data-analyst-group-id (:id (perms-group/data-analyst))]
        (mt/with-temp [:model/User {analyst-id :id} {:first_name "Data"
                                                     :last_name "Analyst"
                                                     :email "data-analyst@metabase.com"
                                                     :is_data_analyst true}
                       :model/PermissionsGroupMembership _ {:user_id analyst-id :group_id data-analyst-group-id}
                       :model/Database {db-id :id} {}
                       :model/Table {table-id :id} {:db_id db-id}
                       :model/Collection _ {:type collection/library-data-collection-type}]
          (testing "data analyst can edit tables"
            (is (= {} (mt/user-http-request analyst-id :post 200 "ee/data-studio/table/edit"
                                            {:table_ids [table-id]
                                             :data_layer "gold"}))))
          (testing "data analyst can get selection info"
            (is (map? (mt/user-http-request analyst-id :post 200 "ee/data-studio/table/selection"
                                            {:table_ids [table-id]}))))
          (testing "data analyst can publish tables"
            (is (map? (mt/user-http-request analyst-id :post 200 "ee/data-studio/table/publish-tables"
                                            {:table_ids [table-id]}))))
          (testing "data analyst can unpublish tables"
            (is (nil? (mt/user-http-request analyst-id :post 204 "ee/data-studio/table/unpublish-tables"
                                            {:table_ids [table-id]})))))))))

(deftest regular-user-cannot-access-data-studio-test
  (mt/with-premium-features #{:data-studio}
    (testing "Regular users (not in Data Analysts group) cannot access data studio endpoints"
      (mt/with-temp [:model/User {user-id :id} {:first_name "Regular"
                                                :last_name "User"
                                                :email "regular-user@metabase.com"}
                     :model/Database {db-id :id} {}
                     :model/Table {table-id :id} {:db_id db-id}
                     :model/Collection _ {:type collection/library-data-collection-type}]
        (testing "regular user cannot edit tables"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request user-id :post 403 "ee/data-studio/table/edit"
                                       {:table_ids [table-id]
                                        :data_layer "gold"}))))
        (testing "regular user cannot get selection info"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request user-id :post 403 "ee/data-studio/table/selection"
                                       {:table_ids [table-id]}))))
        (testing "regular user cannot publish tables"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request user-id :post 403 "ee/data-studio/table/publish-tables"
                                       {:table_ids [table-id]}))))
        (testing "regular user cannot unpublish tables"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request user-id :post 403 "ee/data-studio/table/unpublish-tables"
                                       {:table_ids [table-id]}))))))))

(deftest ^:parallel non-admins-cant-trigger-bulk-sync-test
  (mt/with-premium-features #{:data-studio}
    (testing "Non-admins should not be allowed to trigger sync"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 "ee/data-studio/table/sync-schema" {:database_ids [(mt/id)]}))))))

(deftest trigger-bulk-metadata-sync-for-table-test
  (mt/with-premium-features #{:data-studio}
    ;; lot more to test here but will wait for firmer ground
    (testing "Can we trigger a metadata sync for a filtered set of tables"
      (let [tables       (atom [])
            latch        (CountDownLatch. 4)]
        (mt/with-temp [:model/Database {d1 :id} {:engine "h2", :details (:details (mt/db))}
                       :model/Database {d2 :id} {:engine "h2", :details (:details (mt/db))}
                       :model/Table    {t1 :id} {:db_id d1, :schema "PUBLIC"}
                       :model/Table    {t2 :id} {:db_id d1, :schema "PUBLIC"}
                       :model/Table    {_  :id} {:db_id d2, :schema "PUBLIC"}
                       :model/Table    {t4 :id} {:db_id d2, :schema "PUBLIC"}
                       :model/Table    {t5 :id} {:db_id d2, :schema "FOO"}]
          (with-redefs [sync/sync-table! (fn [table]
                                           (swap! tables conj table)
                                           (.countDown latch)
                                           nil)]
            (mt/user-http-request :crowberto :post 204 "ee/data-studio/table/sync-schema" {:database_ids [d1],
                                                                                           :schema_ids   [(format "%d:FOO" d2)]
                                                                                           :table_ids    [t4]}))
          (testing "sync called?"
            (is (true? (.await latch 4 TimeUnit/SECONDS)))
            (is (= [t1 t2 t4 t5] (map :id @tables)))))))))

(deftest ^:parallel non-admins-cant-trigger-bulk-rescan-values-test
  (mt/with-premium-features #{:data-studio}
    (testing "Non-admins should not be allowed to trigger rescan values"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 "ee/data-studio/table/rescan-values" {:database_ids [(mt/id)]}))))))

(deftest trigger-rescan-values-for-tables-test
  (mt/with-premium-features #{:data-studio}
    ;; lot more to test here but will wait for firmer ground
    (testing "Can we trigger a field values sync for a filtered set of tables"
      (let [tables       (atom [])
            latch        (CountDownLatch. 4)]
        (mt/with-temp [:model/Database {d1 :id} {:engine "h2", :details (:details (mt/db))}
                       :model/Database {d2 :id} {:engine "h2", :details (:details (mt/db))}
                       :model/Table    {t1 :id} {:db_id d1, :schema "PUBLIC"}
                       :model/Table    {t2 :id} {:db_id d1, :schema "PUBLIC"}
                       :model/Table    {_  :id} {:db_id d2, :schema "PUBLIC"}
                       :model/Table    {t4 :id} {:db_id d2, :schema "PUBLIC"}
                       :model/Table    {t5 :id} {:db_id d2, :schema "FOO"}]
          (with-redefs [sync/update-field-values-for-table! (fn [table]
                                                              (swap! tables conj table)
                                                              (.countDown latch)
                                                              nil)]
            (mt/user-http-request :crowberto :post 204 "ee/data-studio/table/rescan-values" {:database_ids [d1],
                                                                                             :schema_ids   [(format "%d:FOO" d2)]
                                                                                             :table_ids    [t4]}))
          (testing "rescanned?"
            (is (true? (.await latch 4 TimeUnit/SECONDS)))
            (is (= [t1 t2 t4 t5] (map :id @tables)))))))))

(deftest ^:parallel non-admins-cant-trigger-bulk-discard-values-test
  (mt/with-premium-features #{:data-studio}
    (testing "Non-admins should not be allowed to trigger discard values"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 "ee/data-studio/table/discard-values" {:database_ids [(mt/id)]}))))))

(deftest ^:parallel bulk-discard-values-test
  (mt/with-premium-features #{:data-studio}
    (testing "POST /api/ee/data-studio/table/discard-values"
      (mt/with-temp
        [:model/Database    {d1 :id} {:engine "h2", :details (:details (mt/db))}
         :model/Database    {d2 :id} {:engine "h2", :details (:details (mt/db))}
         :model/Table       {t1 :id} {:db_id d1, :schema "PUBLIC"}
         :model/Table       {t2 :id} {:db_id d1, :schema "PUBLIC"}
         :model/Table       {t3 :id} {:db_id d2, :schema "PUBLIC"}
         :model/Table       {t4 :id} {:db_id d2, :schema "PUBLIC"}
         :model/Table       {t5 :id} {:db_id d2, :schema "FOO"}
         :model/Field       {f1 :id} {:table_id t1}
         :model/FieldValues {v1 :id} {:field_id f1, :values ["T1"]}
         :model/Field       {f2 :id} {:table_id t2}
         :model/FieldValues {v2 :id} {:field_id f2, :values ["T2"]}
         :model/Field       {f3 :id} {:table_id t3}
         :model/FieldValues {v3 :id} {:field_id f3, :values ["T3"]}
         :model/Field       {f4 :id} {:table_id t4}
         :model/FieldValues {v4 :id} {:field_id f4, :values ["T4-1"]}
         :model/Field       {f5 :id} {:table_id t4}
         :model/FieldValues {v5 :id} {:field_id f5, :values ["T4-2"]}
         :model/Field       {f6 :id} {:table_id t5}
         :model/FieldValues {v6 :id} {:field_id f6, :values ["T5-1"]}
         :model/Field       {f7 :id} {:table_id t5}
         :model/FieldValues {v7 :id} {:field_id f7, :values ["T5-2"]}]
        (let [url "ee/data-studio/table/discard-values"
              remaining-field-values-q {:select   [:fv.id]
                                        :from     [[(t2/table-name :model/FieldValues) :fv]
                                                   [(t2/table-name :model/Field) :f]]
                                        :where    [:and [:= :fv.field_id :f.id]
                                                   [:in :f.table_id [t1 t2 t3 t4 t5]]]
                                        :order-by [[:fv.id :asc]]}
              get-field-values         #(mapv :id (t2/query remaining-field-values-q))]
          (testing "Non-admin toucans should not be allowed to discard values"
            (is (= "You don't have permissions to do that." (mt/user-http-request :rasta :post 403 url {:table_ids [t1]})))
            (testing "FieldValues should still exist"
              (is (= [v1 v2 v3 v4 v5 v6 v7] (get-field-values)))))
          (testing "Admins should be able to successfully delete them"
            (is (nil? (mt/user-http-request :crowberto :post 204 url {:database_ids [d1],
                                                                      :schema_ids   [(format "%d:FOO" d2)]
                                                                      :table_ids    [t4]})))
            (testing "Selected FieldValues should be gone"
              (is (= [v3] (get-field-values))))))))))

(deftest ^:parallel table-selectors->filter-test
  (testing "table-selectors->filter function generates correct WHERE clauses"
    (let [selectors->table-ids (fn [selectors]
                                 (let [where (#'api.table/table-selectors->filter selectors)]
                                   (t2/select-pks-set :model/Table {:where where})))]
      (mt/with-temp [:model/Database {db-1 :id}      {}
                     :model/Database {db-2 :id}      {}
                     :model/Table    {table-1 :id}   {:db_id db-1}
                     :model/Table    {table-2 :id}   {:db_id db-1, :schema "schema-a"}
                     :model/Table    {table-3 :id}   {:db_id db-2, :schema "schema-a"}
                     :model/Table    {table-4 :id}   {:db_id db-2, :schema "schema-b"}
                     :model/Table    {table-5 :id}   {:db_id db-2}]

        (testing "filter by database_ids"
          (is (= #{table-1 table-2}
                 (selectors->table-ids {:database_ids [db-1]}))))

        (testing "filter by table_ids"
          (is (= #{table-3 table-4}
                 (selectors->table-ids {:table_ids [table-3 table-4]}))))

        (testing "filter by schema_ids"
          (is (= #{table-2}
                 (selectors->table-ids {:schema_ids [(format "%d:schema-a" db-1)]}))))

        (testing "filter by multiple schema_ids"
          (is (= #{table-3 table-4}
                 (selectors->table-ids {:schema_ids [(format "%d:schema-a" db-2)
                                                     (format "%d:schema-b" db-2)]}))))

        (testing "combine database_ids and table_ids (OR logic)"
          (is (= #{table-1 table-2 table-3}
                 (selectors->table-ids {:database_ids [db-1]
                                        :table_ids    [table-3]}))))

        (testing "combine all selectors (OR logic)"
          (is (= #{table-1 table-2 table-4 table-5}
                 (selectors->table-ids {:database_ids [db-1]
                                        :table_ids    [table-5]
                                        :schema_ids   [(format "%d:schema-b" db-2)]}))))

        (testing "empty selectors returns no tables"
          (is (= nil (selectors->table-ids {}))))))))

(deftest trigger-sync-on-data-layer-change-from-hidden-test
  (mt/with-premium-features #{:data-studio}
    (testing "Changing data_layer from hidden to another value triggers sync"
      (mt/with-temp [:model/Database {db-id :id}       {}
                     :model/Table    {hidden-1 :id}    {:db_id db-id, :data_layer :hidden}
                     :model/Table    {hidden-2 :id}    {:db_id db-id, :data_layer :hidden}
                     :model/Table    {hidden-3 :id}    {:db_id db-id, :data_layer :hidden}
                     :model/Table    {internal-1 :id}  {:db_id db-id, :data_layer :internal}
                     :model/Table    {published-1 :id} {:db_id db-id, :data_layer :published}]
        (let [synced-ids (atom #{})]
          (mt/with-dynamic-fn-redefs [api.table/sync-unhidden-tables (fn [tables] (reset! synced-ids (set (map :id tables))))]
            (testing "Changing from hidden to published triggers sync"
              (reset! synced-ids #{})
              (mt/user-http-request :crowberto :post 200 "ee/data-studio/table/edit"
                                    {:table_ids  [hidden-1 hidden-2]
                                     :data_layer "published"})
              (is (= #{hidden-1 hidden-2} @synced-ids)))

            (testing "Changing from hidden to internal triggers sync"
              (reset! synced-ids #{})
              (mt/user-http-request :crowberto :post 200 "ee/data-studio/table/edit"
                                    {:table_ids  [hidden-3]
                                     :data_layer "internal"})
              (is (= #{hidden-3} @synced-ids)))

            (testing "Not changing from hidden does not trigger sync"
              (reset! synced-ids #{})
              (mt/user-http-request :crowberto :post 200 "ee/data-studio/table/edit"
                                    {:table_ids  [internal-1]
                                     :data_layer "published"})
              (is (= #{} @synced-ids)))

            (testing "Changing to hidden does not trigger sync"
              (reset! synced-ids #{})
              (mt/user-http-request :crowberto :post 200 "ee/data-studio/table/edit"
                                    {:table_ids  [published-1]
                                     :data_layer "hidden"})
              (is (= #{} @synced-ids)))))))))

(deftest bulk-edit-test
  (mt/with-premium-features #{:data-studio}
    (testing "can edit a bunch of things at once"
      (mt/with-temp [:model/Database {clojure :id}    {}
                     :model/Database {jvm :id}        {}
                     :model/Table    {vars :id}       {:db_id clojure}
                     :model/Table    {namespaces :id} {:db_id clojure}
                     :model/Table    {beans :id}      {:db_id jvm}
                     :model/Table    {classes :id}    {:db_id jvm}
                     :model/Table    {gc :id}         {:db_id jvm, :schema "jre"}
                     :model/Table    {jit :id}        {:db_id jvm, :schema "jre"}]

        (testing "only admin can edit"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :post 403 "ee/data-studio/table/edit"
                                       {:database_ids [clojure jvm]
                                        :data_layer   "hidden"}))))

        (testing "simple happy path updating with db ids"
          (mt/user-http-request :crowberto :post 200 "ee/data-studio/table/edit"
                                {:database_ids   [clojure jvm]
                                 :data_layer     "hidden"
                                 :data_authority "authoritative"
                                 :data_source    "ingested"})
          (is (= #{:hidden} (t2/select-fn-set :data_layer :model/Table :db_id [:in [clojure jvm]])))
          (is (= #{:authoritative} (t2/select-fn-set :data_authority :model/Table :db_id [:in [clojure jvm]])))
          (is (= #{:ingested} (t2/select-fn-set :data_source :model/Table :db_id [:in [clojure jvm]]))))

        (testing "updating with all selectors"
          (mt/user-http-request :crowberto :post 200 "ee/data-studio/table/edit"
                                {:database_ids  [clojure]
                                 :table_ids     [classes]
                                 :schema_ids    [(format "%d:jre" jvm)]
                                 :data_layer    "internal"})
          (is (= {vars       :internal
                  namespaces :internal
                  beans      :hidden
                  classes    :internal
                  gc         :internal
                  jit        :internal}
                 (t2/select-pk->fn :data_layer :model/Table :db_id [:in [clojure jvm]]))))

        (testing "can update owner_email"
          (is (= #{nil} (t2/select-fn-set :owner_email :model/Table :db_id [:in [clojure jvm]])))

          (mt/user-http-request :crowberto :post 200 "ee/data-studio/table/edit"
                                {:database_ids [clojure]
                                 :owner_email  "clojure-owner@example.com"})

          (is (= {vars       "clojure-owner@example.com"
                  namespaces "clojure-owner@example.com"
                  beans      nil
                  classes    nil
                  gc         nil
                  jit        nil}
                 (t2/select-pk->fn :owner_email :model/Table :db_id [:in [clojure jvm]]))))

        (testing "can update owner_user_id"
          (is (= #{nil} (t2/select-fn-set :owner_user_id :model/Table :db_id [:in [clojure jvm]])))

          (mt/user-http-request :crowberto :post 200 "ee/data-studio/table/edit"
                                {:table_ids      [beans classes]
                                 :owner_user_id  (mt/user->id :rasta)})

          (is (= {vars       nil
                  namespaces nil
                  beans      (mt/user->id :rasta)
                  classes    (mt/user->id :rasta)
                  gc         nil
                  jit        nil}
                 (t2/select-pk->fn :owner_user_id :model/Table :db_id [:in [clojure jvm]]))))))))

;;; ------------------------------------------------- Selection Tests -------------------------------------------------

(deftest selection-basic-test
  (mt/with-premium-features #{:data-studio}
    (testing "POST /api/ee/data-studio/table/selection"
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/Table    {t1 :id} {:db_id db-id :name "orders" :schema "PUBLIC" :is_published false}
                     :model/Table    {t2 :id} {:db_id db-id :name "products" :schema "PUBLIC" :is_published true}
                     :model/Table    _        {:db_id db-id :name "people" :schema "PUBLIC" :is_published false}]
        (testing "returns a published table in selection with all required fields"
          (let [response (mt/user-http-request :crowberto :post 200 "ee/data-studio/table/selection"
                                               {:table_ids [t2]})]
            (is (=? {:selected_table {:id           t2
                                      :db_id        db-id
                                      :name         "products"
                                      :display_name "Products"
                                      :schema       "PUBLIC"
                                      :is_published true}}
                    response))))
        (testing "returns an unpublished table in selection with all required fields"
          (let [response (mt/user-http-request :crowberto :post 200 "ee/data-studio/table/selection"
                                               {:table_ids [t1]})]
            (is (=? {:selected_table {:id           t1
                                      :db_id        db-id
                                      :name         "orders"
                                      :display_name "Orders"
                                      :schema       "PUBLIC"
                                      :is_published false}}
                    response))))
        (testing "returns nil for :selected_table when there are multiple selected tables"
          (let [response (mt/user-http-request :crowberto :post 200 "ee/data-studio/table/selection"
                                               {:table_ids [t1 t2]})]
            (is (=? {:selected_table nil}
                    response))))
        (testing "tables with no remapping should have empty upstream/downstream"
          (let [response (mt/user-http-request :crowberto :post 200 "ee/data-studio/table/selection"
                                               {:table_ids [t2]})]
            (is (=? {:published_downstream_tables []
                     :unpublished_upstream_tables []}
                    response))))))))

(deftest selection-with-remapping-test
  (mt/with-premium-features #{:data-studio}
    (testing "POST /api/ee/data-studio/table/selection with remapping dependencies"
      (mt/with-temp [:model/Database  {db-id :id}    {}
                     ;; Orders table with FK to Products
                     :model/Table     {orders-id :id}   {:db_id db-id :name "orders" :schema "PUBLIC" :is_published false}
                     :model/Field     _                 {:table_id orders-id :name "id" :semantic_type :type/PK
                                                         :base_type :type/Integer}
                     :model/Field     {product-fk :id}  {:table_id orders-id :name "product_id" :semantic_type :type/FK
                                                         :base_type :type/Integer}
                     ;; Products table
                     :model/Table     {products-id :id} {:db_id db-id :name "products" :schema "PUBLIC" :is_published false}
                     :model/Field     _                 {:table_id products-id :name "id" :semantic_type :type/PK
                                                         :base_type :type/Integer}
                     :model/Field     {prod-name-f :id} {:table_id products-id :name "name" :semantic_type :type/Name
                                                         :base_type :type/Text}
                     ;; Dimension for FK remapping: product_id -> products.name
                     :model/Dimension _                 {:field_id product-fk
                                                         :human_readable_field_id prod-name-f
                                                         :type :external}]
        (testing "selecting orders returns products as upstream dependency"
          (let [response (mt/user-http-request :crowberto :post 200 "ee/data-studio/table/selection"
                                               {:table_ids [orders-id]})]
            (is (=? {:selected_table               {:id           orders-id
                                                    :db_id        db-id
                                                    :name         "orders"
                                                    :display_name "Orders"
                                                    :schema       "PUBLIC"}
                     :unpublished_upstream_tables [{:id           products-id
                                                    :db_id        db-id
                                                    :name         "products"
                                                    :display_name "Products"
                                                    :schema       "PUBLIC"}]}
                    response))))

        (testing "if products is already published, it appears in published_downstream when selecting it"
          (t2/update! :model/Table products-id {:is_published true})
          (let [response (mt/user-http-request :crowberto :post 200 "ee/data-studio/table/selection"
                                               {:table_ids [products-id]})]
            (is (=? {:selected_table               {:id           products-id
                                                    :db_id        db-id
                                                    :name         "products"
                                                    :display_name "Products"
                                                    :schema       "PUBLIC"}
                     :unpublished_upstream_tables []}
                    response))
            ;; orders is unpublished and depends on products
            ;; when we want to unpublish products, orders would need to be unpublished too
            ;; but orders is already unpublished, so published_downstream_tables should be empty
            (is (= [] (:published_downstream_tables response)))))

        (testing "when orders is published and we select products, orders appears in published_downstream"
          (t2/update! :model/Table orders-id {:is_published true})
          (t2/update! :model/Table products-id {:is_published true})
          (let [response (mt/user-http-request :crowberto :post 200 "ee/data-studio/table/selection"
                                               {:table_ids [products-id]})]
            (is (=? {:selected_table               {:id           products-id
                                                    :db_id        db-id
                                                    :name         "products"
                                                    :display_name "Products"
                                                    :schema       "PUBLIC"}
                     :published_downstream_tables [{:id           orders-id
                                                    :db_id        db-id
                                                    :name         "orders"
                                                    :display_name "Orders"
                                                    :schema       "PUBLIC"}]}
                    response))))))))

(deftest selection-recursive-upstream-test
  (mt/with-premium-features #{:data-studio}
    (testing "POST /api/ee/data-studio/table/selection with recursive upstream dependencies"
      ;; Chain: order_items -> orders -> customers
      ;; order_items.order_id remaps to orders.name
      ;; orders.customer_id remaps to customers.name
      (mt/with-temp [:model/Database  {db-id :id}          {}
                     ;; Customers table
                     :model/Table     {customers-id :id}   {:db_id db-id :name "customers" :schema "PUBLIC"
                                                            :is_published false}
                     :model/Field     _                    {:table_id customers-id :name "id"
                                                            :semantic_type :type/PK :base_type :type/Integer}
                     :model/Field     {cust-name-f :id}    {:table_id customers-id :name "name"
                                                            :semantic_type :type/Name :base_type :type/Text}
                     ;; Orders table
                     :model/Table     {orders-id :id}      {:db_id db-id :name "orders" :schema "PUBLIC"
                                                            :is_published false}
                     :model/Field     _                    {:table_id orders-id :name "id"
                                                            :semantic_type :type/PK :base_type :type/Integer}
                     :model/Field     {order-name-f :id}   {:table_id orders-id :name "name"
                                                            :semantic_type :type/Name :base_type :type/Text}
                     :model/Field     {customer-fk :id}    {:table_id orders-id :name "customer_id"
                                                            :semantic_type :type/FK :base_type :type/Integer}
                     ;; Order items table
                     :model/Table     {items-id :id}       {:db_id db-id :name "order_items" :schema "PUBLIC"
                                                            :is_published false}
                     :model/Field     _                    {:table_id items-id :name "id"
                                                            :semantic_type :type/PK :base_type :type/Integer}
                     :model/Field     {order-fk :id}       {:table_id items-id :name "order_id"
                                                            :semantic_type :type/FK :base_type :type/Integer}
                     ;; Dimensions for FK remapping
                     :model/Dimension _                    {:field_id customer-fk
                                                            :human_readable_field_id cust-name-f
                                                            :type :external}
                     :model/Dimension _                    {:field_id order-fk
                                                            :human_readable_field_id order-name-f
                                                            :type :external}]
        (testing "selecting order_items returns orders and customers as upstream (recursive)"
          (let [response (mt/user-http-request :crowberto :post 200 "ee/data-studio/table/selection"
                                               {:table_ids [items-id]})]
            (is (=? {:selected_table               {:id           items-id
                                                    :db_id        db-id
                                                    :name         "order_items"
                                                    :display_name "Order Items"
                                                    :schema       "PUBLIC"}
                     :unpublished_upstream_tables (mt/malli=? [:sequential {:min 2 :max 2} :map])}
                    response))
            (is (= #{orders-id customers-id}
                   (set (map :id (:unpublished_upstream_tables response)))))
            ;; Verify upstream tables have all required fields
            (doseq [table (:unpublished_upstream_tables response)]
              (are [k] (contains? table k)
                :id :db_id :name :display_name :schema))))))))

(deftest selection-recursive-downstream-test
  (mt/with-premium-features #{:data-studio}
    (testing "POST /api/ee/data-studio/table/selection with recursive downstream dependencies"
      ;; Same chain: order_items -> orders -> customers
      ;; If we unpublish customers, we need to unpublish orders and order_items too
      (mt/with-temp [:model/Database  {db-id :id}          {}
                     ;; Customers table (published)
                     :model/Table     {customers-id :id}   {:db_id db-id :name "customers" :schema "PUBLIC"
                                                            :is_published true}
                     :model/Field     _                    {:table_id customers-id :name "id"
                                                            :semantic_type :type/PK :base_type :type/Integer}
                     :model/Field     {cust-name-f :id}    {:table_id customers-id :name "name"
                                                            :semantic_type :type/Name :base_type :type/Text}
                     ;; Orders table (published)
                     :model/Table     {orders-id :id}      {:db_id db-id :name "orders" :schema "PUBLIC"
                                                            :is_published true}
                     :model/Field     _                    {:table_id orders-id :name "id"
                                                            :semantic_type :type/PK :base_type :type/Integer}
                     :model/Field     {order-name-f :id}   {:table_id orders-id :name "name"
                                                            :semantic_type :type/Name :base_type :type/Text}
                     :model/Field     {customer-fk :id}    {:table_id orders-id :name "customer_id"
                                                            :semantic_type :type/FK :base_type :type/Integer}
                     ;; Order items table (published)
                     :model/Table     {items-id :id}       {:db_id db-id :name "order_items" :schema "PUBLIC"
                                                            :is_published true}
                     :model/Field     _                    {:table_id items-id :name "id"
                                                            :semantic_type :type/PK :base_type :type/Integer}
                     :model/Field     {order-fk :id}       {:table_id items-id :name "order_id"
                                                            :semantic_type :type/FK :base_type :type/Integer}
                     ;; Dimensions for FK remapping
                     :model/Dimension _                    {:field_id customer-fk
                                                            :human_readable_field_id cust-name-f
                                                            :type :external}
                     :model/Dimension _                    {:field_id order-fk
                                                            :human_readable_field_id order-name-f
                                                            :type :external}]
        (testing "selecting customers returns orders and order_items as downstream (recursive)"
          (let [response (mt/user-http-request :crowberto :post 200 "ee/data-studio/table/selection"
                                               {:table_ids [customers-id]})]
            (is (=? {:selected_table               {:id           customers-id
                                                    :db_id        db-id
                                                    :name         "customers"
                                                    :display_name "Customers"
                                                    :schema       "PUBLIC"}
                     :published_downstream_tables (mt/malli=? [:sequential {:min 2 :max 2} :map])}
                    response))
            (is (= #{orders-id items-id}
                   (set (map :id (:published_downstream_tables response)))))
            ;; Verify downstream tables have all required fields
            (doseq [table (:published_downstream_tables response)]
              (are [k] (contains? table k)
                :id :db_id :name :display_name :schema))))))))

;;; ------------------------------------------ Publish/Unpublish with Dependencies ------------------------------------------

(deftest publish-tables-with-upstream-dependencies-test
  (mt/with-premium-features #{:data-studio}
    (testing "POST /api/ee/data-studio/table/publish-tables publishes upstream dependencies"
      (mt/with-temp [:model/Collection _                      {:type collection/library-data-collection-type}
                     :model/Database   {db-id :id}          {}
                     ;; Products table (upstream)
                     :model/Table      {products-id :id}    {:db_id db-id :name "products" :is_published false}
                     :model/Field      _                    {:table_id products-id :name "id"
                                                             :semantic_type :type/PK :base_type :type/Integer}
                     :model/Field      {prod-name-f :id}    {:table_id products-id :name "name"
                                                             :semantic_type :type/Name :base_type :type/Text}
                     ;; Orders table (depends on products)
                     :model/Table      {orders-id :id}      {:db_id db-id :name "orders" :is_published false}
                     :model/Field      _                    {:table_id orders-id :name "id"
                                                             :semantic_type :type/PK :base_type :type/Integer}
                     :model/Field      {product-fk :id}     {:table_id orders-id :name "product_id"
                                                             :semantic_type :type/FK :base_type :type/Integer}
                     ;; Dimension for FK remapping
                     :model/Dimension  _                    {:field_id product-fk
                                                             :human_readable_field_id prod-name-f
                                                             :type :external}]
        (testing "publishing orders also publishes products (upstream dependency)"
          (mt/user-http-request :crowberto :post 200 "ee/data-studio/table/publish-tables"
                                {:table_ids [orders-id]})
          (are [table-id] (true? (t2/select-one-fn :is_published :model/Table table-id))
            orders-id products-id))))))

(deftest publish-tables-recursive-upstream-test
  (mt/with-premium-features #{:data-studio}
    (testing "POST /api/ee/data-studio/table/publish-tables publishes recursive upstream dependencies"
      (mt/with-temp [:model/Collection _                      {:type collection/library-data-collection-type}
                     :model/Database   {db-id :id}          {}
                     ;; Customers table (upstream of orders)
                     :model/Table      {customers-id :id}   {:db_id db-id :name "customers" :is_published false}
                     :model/Field      _                    {:table_id customers-id :name "id"
                                                             :semantic_type :type/PK :base_type :type/Integer}
                     :model/Field      {cust-name-f :id}    {:table_id customers-id :name "name"
                                                             :semantic_type :type/Name :base_type :type/Text}
                     ;; Orders table (upstream of order_items, downstream of customers)
                     :model/Table      {orders-id :id}      {:db_id db-id :name "orders" :is_published false}
                     :model/Field      _                    {:table_id orders-id :name "id"
                                                             :semantic_type :type/PK :base_type :type/Integer}
                     :model/Field      {order-name-f :id}   {:table_id orders-id :name "name"
                                                             :semantic_type :type/Name :base_type :type/Text}
                     :model/Field      {customer-fk :id}    {:table_id orders-id :name "customer_id"
                                                             :semantic_type :type/FK :base_type :type/Integer}
                     ;; Order items table (downstream of orders)
                     :model/Table      {items-id :id}       {:db_id db-id :name "order_items" :is_published false}
                     :model/Field      _                    {:table_id items-id :name "id"
                                                             :semantic_type :type/PK :base_type :type/Integer}
                     :model/Field      {order-fk :id}       {:table_id items-id :name "order_id"
                                                             :semantic_type :type/FK :base_type :type/Integer}
                     ;; Dimensions for FK remapping
                     :model/Dimension  _                    {:field_id customer-fk
                                                             :human_readable_field_id cust-name-f
                                                             :type :external}
                     :model/Dimension  _                    {:field_id order-fk
                                                             :human_readable_field_id order-name-f
                                                             :type :external}]
        (testing "publishing order_items also publishes orders and customers (recursive upstream)"
          (mt/user-http-request :crowberto :post 200 "ee/data-studio/table/publish-tables"
                                {:table_ids [items-id]})
          (are [table-id] (true? (t2/select-one-fn :is_published :model/Table table-id))
            items-id orders-id customers-id))))))

(deftest unpublish-tables-with-downstream-dependents-test
  (mt/with-premium-features #{:data-studio}
    (testing "POST /api/ee/data-studio/table/unpublish-tables unpublishes downstream dependents"
      (mt/with-temp [:model/Collection {coll-id :id}        {:type collection/library-data-collection-type}
                     :model/Database   {db-id :id}          {}
                     ;; Products table (upstream, published)
                     :model/Table      {products-id :id}    {:db_id db-id :name "products" :is_published true
                                                             :collection_id coll-id}
                     :model/Field      _                    {:table_id products-id :name "id"
                                                             :semantic_type :type/PK :base_type :type/Integer}
                     :model/Field      {prod-name-f :id}    {:table_id products-id :name "name"
                                                             :semantic_type :type/Name :base_type :type/Text}
                     ;; Orders table (depends on products, published)
                     :model/Table      {orders-id :id}      {:db_id db-id :name "orders" :is_published true
                                                             :collection_id coll-id}
                     :model/Field      _                    {:table_id orders-id :name "id"
                                                             :semantic_type :type/PK :base_type :type/Integer}
                     :model/Field      {product-fk :id}     {:table_id orders-id :name "product_id"
                                                             :semantic_type :type/FK :base_type :type/Integer}
                     ;; Dimension for FK remapping
                     :model/Dimension  _                    {:field_id product-fk
                                                             :human_readable_field_id prod-name-f
                                                             :type :external}]
        (testing "unpublishing products also unpublishes orders (downstream dependent)"
          (mt/user-http-request :crowberto :post 204 "ee/data-studio/table/unpublish-tables"
                                {:table_ids [products-id]})
          (are [table-id] (false? (t2/select-one-fn :is_published :model/Table table-id))
            products-id orders-id))))))

(deftest unpublish-tables-recursive-downstream-test
  (mt/with-premium-features #{:data-studio}
    (testing "POST /api/ee/data-studio/table/unpublish-tables unpublishes recursive downstream dependents"
      (mt/with-temp [:model/Collection {coll-id :id}        {:type collection/library-data-collection-type}
                     :model/Database   {db-id :id}          {}
                     ;; Customers table (upstream of orders, published)
                     :model/Table      {customers-id :id}   {:db_id db-id :name "customers" :is_published true
                                                             :collection_id coll-id}
                     :model/Field      _                    {:table_id customers-id :name "id"
                                                             :semantic_type :type/PK :base_type :type/Integer}
                     :model/Field      {cust-name-f :id}    {:table_id customers-id :name "name"
                                                             :semantic_type :type/Name :base_type :type/Text}
                     ;; Orders table (downstream of customers, upstream of items, published)
                     :model/Table      {orders-id :id}      {:db_id db-id :name "orders" :is_published true
                                                             :collection_id coll-id}
                     :model/Field      _                    {:table_id orders-id :name "id"
                                                             :semantic_type :type/PK :base_type :type/Integer}
                     :model/Field      {order-name-f :id}   {:table_id orders-id :name "name"
                                                             :semantic_type :type/Name :base_type :type/Text}
                     :model/Field      {customer-fk :id}    {:table_id orders-id :name "customer_id"
                                                             :semantic_type :type/FK :base_type :type/Integer}
                     ;; Order items table (downstream of orders, published)
                     :model/Table      {items-id :id}       {:db_id db-id :name "order_items" :is_published true
                                                             :collection_id coll-id}
                     :model/Field      _                    {:table_id items-id :name "id"
                                                             :semantic_type :type/PK :base_type :type/Integer}
                     :model/Field      {order-fk :id}       {:table_id items-id :name "order_id"
                                                             :semantic_type :type/FK :base_type :type/Integer}
                     ;; Dimensions for FK remapping
                     :model/Dimension  _                    {:field_id customer-fk
                                                             :human_readable_field_id cust-name-f
                                                             :type :external}
                     :model/Dimension  _                    {:field_id order-fk
                                                             :human_readable_field_id order-name-f
                                                             :type :external}]
        (testing "unpublishing customers also unpublishes orders and order_items (recursive downstream)"
          (mt/user-http-request :crowberto :post 204 "ee/data-studio/table/unpublish-tables"
                                {:table_ids [customers-id]})
          (are [table-id] (false? (t2/select-one-fn :is_published :model/Table table-id))
            customers-id orders-id items-id))))))

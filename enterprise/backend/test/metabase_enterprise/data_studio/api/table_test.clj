(ns ^:mb/driver-tests metabase-enterprise.data-studio.api.table-test
  "Tests for /api/ee/data-studio/table endpoints."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-studio.api.table :as api.table]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.test-helpers :refer [without-library]]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [toucan2.core :as t2])
  (:import (java.util.concurrent CountDownLatch TimeUnit)))

(set! *warn-on-reflection* true)

(deftest publish-table-test
  (mt/with-premium-features #{:data-studio}
    (without-library
     (testing "POST /api/ee/data-studio/table/(un)publish-table"
       (testing "publishes tables into the library-models collection"
         (mt/with-temp [:model/Collection {collection-id :id} {:type collection/library-models-collection-type}]
           (let [response (mt/user-http-request :crowberto :post 200 "ee/data-studio/table/publish-table"
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
             (testing "unpublishing"
               (mt/user-http-request :crowberto :post 200 "ee/data-studio/table/unpublish-table"
                                     {:table_ids [(mt/id :venues)]})
               (is (=? {:display_name "Venues"
                        :collection_id nil
                        :is_published false}
                       (t2/select-one :model/Table (mt/id :venues)))))))
         (testing "deleting the collection unpublishes"
           (is (=? {:display_name "Users"
                    :collection_id nil
                    :is_published false}
                   (t2/select-one :model/Table (mt/id :users))))))
       (testing "returns 404 when no library-models collection exists"
         (is (= "Not found."
                (mt/user-http-request :crowberto :post 404 "ee/data-studio/table/publish-table"
                                      {:table_ids [(mt/id :users)]}))))
       (testing "returns 409 when multiple library-models collections exist"
         (mt/with-temp [:model/Collection _ {:type collection/library-models-collection-type}
                        :model/Collection _ {:type collection/library-models-collection-type}]
           (is (= "Multiple library-models collections found."
                  (mt/user-http-request :crowberto :post 409 "ee/data-studio/table/publish-table"
                                        {:table_ids [(mt/id :users)]})))))))))

(deftest bulk-edit-visibility-sync-test
  (mt/with-premium-features #{:data-studio}
    (testing "POST /api/ee/data-studio/table/edit visibility field synchronization"
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/Table    {table-1-id :id} {:db_id db-id}
                     :model/Table    {table-2-id :id} {:db_id db-id}]

        (testing "updating data_layer syncs to visibility_type for all tables"
        ;; Update two tables to gold, which should sync to nil visibility_type
          (mt/user-http-request :crowberto :post 200 "ee/data-studio/table/edit"
                                {:table_ids  [table-1-id table-2-id]
                                 :data_layer "gold"})
          (is (= :gold (t2/select-one-fn :data_layer :model/Table :id table-1-id)))
          (is (= nil (t2/select-one-fn :visibility_type :model/Table :id table-1-id)))
          (is (= :gold (t2/select-one-fn :data_layer :model/Table :id table-2-id)))
          (is (= nil (t2/select-one-fn :visibility_type :model/Table :id table-2-id))))

        (testing "updating data_layer to copper syncs to hidden visibility_type"
        ;; Update one table back to copper, which should sync to :hidden
          (mt/user-http-request :crowberto :post 200 "ee/data-studio/table/edit"
                                {:table_ids  [table-1-id]
                                 :data_layer "copper"})
          (is (= :copper (t2/select-one-fn :data_layer :model/Table :id table-1-id)))
          (is (= :hidden (t2/select-one-fn :visibility_type :model/Table :id table-1-id))))

        (testing "cannot update both visibility_type and data_layer at once"
          (mt/user-http-request :crowberto :post 400 "ee/data-studio/table/edit"
                                {:table_ids        [table-1-id]
                                 :visibility_type  "hidden"
                                 :data_layer "copper"}))))))

(deftest requests-data-studio-feature-flag-test
  (mt/with-premium-features #{}
    (is (= "Data Studio is a paid feature not currently available to your instance. Please upgrade to use it. Learn more at metabase.com/upgrade/"
           (:message (mt/user-http-request :crowberto :post 402 "ee/data-studio/table/edit"
                                           {:table_ids  [(mt/id :users)]
                                            :data_layer "gold"}))))))

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
            (mt/user-http-request :crowberto :post 200 "ee/data-studio/table/sync-schema" {:database_ids [d1],
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
            (mt/user-http-request :crowberto :post 200 "ee/data-studio/table/rescan-values" {:database_ids [d1],
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
            (is (= {:status "ok"} (mt/user-http-request :crowberto :post 200 url {:database_ids [d1],
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

(deftest trigger-sync-on-data-layer-change-from-copper-test
  (mt/with-premium-features #{:data-studio}
    (testing "Changing data_layer from copper to another value triggers sync"
      (mt/with-temp [:model/Database {db-id :id}      {}
                     :model/Table    {copper-1 :id}   {:db_id db-id, :data_layer :copper}
                     :model/Table    {copper-2 :id}   {:db_id db-id, :data_layer :copper}
                     :model/Table    {copper-3 :id}   {:db_id db-id, :data_layer :copper}
                     :model/Table    {copper-4 :id}   {:db_id db-id, :data_layer :copper}
                     :model/Table    {gold-1 :id}     {:db_id db-id, :data_layer :gold}
                     :model/Table    {gold-2 :id}     {:db_id db-id, :data_layer :gold}]
        (let [synced-ids (atom #{})]
          (mt/with-dynamic-fn-redefs [api.table/sync-unhidden-tables (fn [tables] (reset! synced-ids (set (map :id tables))))]
            (testing "Changing from copper to gold triggers sync"
              (reset! synced-ids #{})
              (mt/user-http-request :crowberto :post 200 "ee/data-studio/table/edit"
                                    {:table_ids  [copper-1 copper-2]
                                     :data_layer "gold"})
              (is (= #{copper-1 copper-2} @synced-ids)))

            (testing "Changing from copper to silver triggers sync"
              (reset! synced-ids #{})
              (mt/user-http-request :crowberto :post 200 "ee/data-studio/table/edit"
                                    {:table_ids  [copper-3]
                                     :data_layer "silver"})
              (is (= #{copper-3} @synced-ids)))

            (testing "Changing from copper to bronze triggers sync"
              (reset! synced-ids #{})
              (mt/user-http-request :crowberto :post 200 "ee/data-studio/table/edit"
                                    {:table_ids  [copper-4]
                                     :data_layer "bronze"})
              (is (= #{copper-4} @synced-ids)))

            (testing "Not changing from copper does not trigger sync"
              (reset! synced-ids #{})
              (mt/user-http-request :crowberto :post 200 "ee/data-studio/table/edit"
                                    {:table_ids  [gold-1]
                                     :data_layer "silver"})
              (is (= #{} @synced-ids)))

            (testing "Changing to copper does not trigger sync"
              (reset! synced-ids #{})
              (mt/user-http-request :crowberto :post 200 "ee/data-studio/table/edit"
                                    {:table_ids  [gold-2]
                                     :data_layer "copper"})
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
                                        :data_layer   "copper"}))))

        (testing "simple happy path updating with db ids"
          (mt/user-http-request :crowberto :post 200 "ee/data-studio/table/edit"
                                {:database_ids   [clojure jvm]
                                 :data_layer     "copper"
                                 :data_authority "authoritative"
                                 :data_source    "ingested"})
          (is (= #{:copper} (t2/select-fn-set :data_layer :model/Table :db_id [:in [clojure jvm]])))
          (is (= #{:authoritative} (t2/select-fn-set :data_authority :model/Table :db_id [:in [clojure jvm]])))
          (is (= #{:ingested} (t2/select-fn-set :data_source :model/Table :db_id [:in [clojure jvm]]))))

        (testing "updating with all selectors"
          (mt/user-http-request :crowberto :post 200 "ee/data-studio/table/edit"
                                {:database_ids  [clojure]
                                 :table_ids     [classes]
                                 :schema_ids    [(format "%d:jre" jvm)]
                                 :data_layer    "silver"})
          (is (= {vars       :silver
                  namespaces :silver
                  beans      :copper
                  classes    :silver
                  gc         :silver
                  jit        :silver}
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

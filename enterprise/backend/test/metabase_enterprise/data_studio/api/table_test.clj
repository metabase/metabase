(ns ^:mb/driver-tests metabase-enterprise.data-studio.api.table-test
  "Tests for /api/ee/data-studio/table endpoints."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-studio.api.table :as api.table]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import (java.util.concurrent CountDownLatch TimeUnit)))

(set! *warn-on-reflection* true)

(deftest publish-model-test
  (mt/with-premium-features #{:data-studio}
    (testing "POST /api/ee/data-studio/table/publish-model"
      (testing "creates models for selected tables"
        (mt/with-model-cleanup [:model/Card]
          (mt/with-temp [:model/Collection {collection-id :id} {}]
            (let [response (mt/user-http-request :crowberto :post 200 "ee/data-studio/table/publish-model"
                                                 {:table_ids             [(mt/id :users) (mt/id :venues)]
                                                  :target_collection_id  collection-id})]
              (is (= 2 (:created_count response)))
              (is (= 2 (count (:models response))))
              (testing "models have correct attributes"
                (doseq [model (:models response)]
                  (is (= "model" (:type model)))
                  (is (= collection-id (:collection_id model)))
                  (is (int? (:published_table_id model)))))
              (testing "the query should works"
                (is (some? (mt/process-query (-> response :models first :dataset_query)))))
              (testing "models are persisted in database"
                (is (= 2 (t2/count :model/Card :collection_id collection-id :type :model)))))))))))
;: TODO (Ngoc 31/10/2025): test publish model to library mark the library as dirty

(deftest published-as-model-test
  (mt/with-premium-features #{:data-studio}
    (mt/with-model-cleanup [:model/Card]
      (mt/with-temp [:model/Collection {collection-id :id} {}]
        (let [{:keys [models]} (mt/user-http-request :crowberto :post 200 "ee/data-studio/table/publish-model"
                                                     {:table_ids            [(mt/id :venues)]
                                                      :target_collection_id collection-id})
              [model] models
              venues-schema              (t2/select-one-fn :schema [:model/Table :schema] (mt/id :venues))
              schema-url                 (format "database/%d/schema/%s" (mt/id) venues-schema)
              list-tables-via-table-api  (fn [] (->> (mt/user-http-request :crowberto :get 200 "table" :db-id (mt/id))
                                                     (filter #(= (mt/id) (:db_id %)))))
              list-tables-via-schema-api #(mt/user-http-request :crowberto :get 200 schema-url)]
          (testing "list tables"
            (let [list-response      (list-tables-via-table-api)
                  published-as-model (u/index-by :id :published_as_model list-response)]
              (is (true? (published-as-model (mt/id :venues))))
              (is (false? (published-as-model (mt/id :users))))))
          (testing "list tables via schema"
            (let [list-response      (list-tables-via-schema-api)
                  published-as-model (u/index-by :id :published_as_model list-response)]
              (is (true? (published-as-model (mt/id :venues))))
              (is (false? (published-as-model (mt/id :users))))))
          (testing "archived tables are not returned"
            (t2/update! :model/Card (:id model) {:archived true, :archived_directly false})
            (is (not-any? :published_as_model (list-tables-via-table-api)))))))))

(deftest published-models-perm-test
  (mt/with-premium-features #{:data-studio}
    ;; what I think would be reasonable permissions behaviour:
    ;;  > if no permissions on model or its collection, model is filtered out
    ;; what I have done:
    ;;  > if not super-user we never give you the published models
    (mt/with-model-cleanup [:model/Card]
      (mt/with-temp [:model/Collection {collection1 :id} {}
                     :model/Collection {collection2 :id} {}]
        (let [publish-venues        #(mt/user-http-request :crowberto :post 200 "ee/data-studio/table/publish-model"
                                                           {:table_ids            [(mt/id :venues)]
                                                            :target_collection_id %})
              {[{model1 :id}] :models} (publish-venues collection1)
              {[{model2 :id}] :models} (publish-venues collection2)
              query-meta-url        #(format "table/%d/query_metadata" %)
              list-published-models #(:published_models (mt/user-http-request %1 :get 200 (query-meta-url %2)))]
          (testing "admin sees both models"
            (is (= #{model1 model2} (set (map :id (list-published-models :crowberto (mt/id :venues)))))))
          (testing "no published models"
            (is (nil? (list-published-models :crowberto (mt/id :users)))))
          (testing "non admin does not see published models"
            (is (nil? (list-published-models :rasta (mt/id :venues))))
            (is (nil? (list-published-models :rasta (mt/id :users))))))))))

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

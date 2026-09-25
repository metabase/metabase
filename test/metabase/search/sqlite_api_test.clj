(ns metabase.search.sqlite-api-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.app-db.connection :as connection]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.data-source :as data-source]
   [metabase.app-db.liquibase :as liquibase]
   [metabase.request.current :as request]
   [metabase.search.api]
   [metabase.search.appdb.core]
   [metabase.search.appdb.index :as index]
   [metabase.search.appdb.specialization.api :as specialization]
   [toucan2.core :as t2])
  (:import
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)))

(set! *warn-on-reflection* true)

(use-fixtures :each
  (fn [f]
    (let [path (Files/createTempFile "metabase-sqlite-search-api-" ".db" (make-array FileAttribute 0))
          source (data-source/broken-out-details->DataSource :sqlite {:db (str path)})]
      (try
        (with-open [conn (.getConnection source)]
          (liquibase/with-liquibase [lb conn]
            (.update lb "")))
        (mdb/with-application-db (connection/application-db :sqlite source)
          (f))
        (finally
          (doseq [suffix ["" "-wal" "-shm"]]
            (Files/deleteIfExists (.resolveSibling path (str (.getFileName path) suffix)))))))))

(defn- seed-permissions! []
  (t2/query {:insert-into :core_user
             :values (for [id [100 101]]
                       {:id id :email (str id "@sqlite.test") :entity_id (str "sqlite-test-user-" id)
                        :date_joined "2026-09-24 00:00:00.000000"})})
  (t2/query {:insert-into :permissions_group_membership :values [{:user_id 100 :group_id 1}]})
  (t2/query {:insert-into :collection
             :values [{:id 100 :name "Visible" :slug "visible" :entity_id "sqlite-visible"}
                      {:id 101 :name "Secret" :slug "secret" :entity_id "sqlite-secret"}
                      {:id 102 :name "Other user's personal" :slug "personal" :entity_id "sqlite-personal"
                       :personal_owner_id 101}]})
  (t2/query {:insert-into :permissions
             :values [{:group_id 1 :object "/collection/100/read/" :collection_id 100
                       :perm_type "perms/collection-access" :perm_value "read"}]}))

(defn- indexed-card [id name collection-id & {:keys [archived]}]
  (#'index/document->entry
   {:id (str id) :name name :model "card" :collection_id collection-id :archived (boolean archived)
    :searchable_text name :display_data {}
    :legacy_input {:id id :name name :model "card" :collection_id collection-id :collection_location "/"
                   :archived (boolean archived)}}))

(deftest collection-permissions-pagination-test
  (seed-permissions!)
  (index/with-temp-index-table
    (do
      (specialization/batch-upsert!
       (index/active-table)
       [(indexed-card 1 "Needle visible A" 100)
        (indexed-card 2 "Needle visible B" 100)
        (indexed-card 3 "Needle" 101)
        (indexed-card 4 "Needle personal" 102)
        (indexed-card 5 "Needle archived" 100 :archived true)])
      (let [user (t2/select-one :model/User 100)
            perms #{"/collection/100/read/"}
            params {:q "Needle" :models ["card"] :search_engine "appdb"
                    :calculate_available_models true}
            endpoint (api.macros/find-route-fn 'metabase.search.api :get "/")]
        (binding [api/*current-user-id* 100 api/*current-user* (delay user)
                  api/*current-user-permissions-set* (atom perms) api/*is-superuser?* false]
          (let [result (:body (endpoint {} params nil nil))
                page (:body (request/with-limit-and-offset 1 1 (endpoint {} params nil nil)))]
            (is (= #{1 2} (set (map :id (:data result)))))
            (is (= 2 (:total result)))
            (is (= #{"card"} (:available_models result)))
            (is (every? false? (map :can_write (:data result))))
            (is (= 2 (:total page)))
            (is (= 1 (count (:data page))))
            (is (= [(-> result :data second :id)] (mapv :id (:data page))))
            (testing "A zero-sized page still counts only authorized content"
              (let [empty-page (:body (request/with-limit-and-offset 0 0 (endpoint {} params nil nil)))]
                (is (= [] (:data empty-page)))
                (is (= 2 (:total empty-page)))))
            (testing "Specifying a denied collection cannot bypass permissions"
              (let [denied (:body (endpoint {} (assoc params :collection 101) nil nil))]
                (is (= [] (:data denied)))
                (is (= 0 (:total denied)))))
            (testing "Read permission alone does not reveal archived content"
              (is (= [] (:data (:body (endpoint {} (assoc params :archived true) nil nil))))))
            (testing "Revoked collection grants take effect without rebuilding the index"
              (t2/query {:delete-from :permissions :where [:= :collection_id 100]})
              (reset! api/*current-user-permissions-set* #{})
              (let [revoked (:body (endpoint {} params nil nil))]
                (is (= [] (:data revoked)))
                (is (= 0 (:total revoked)))))))))))

(deftest table-permissions-test
  (seed-permissions!)
  (t2/query {:insert-into :metabase_database
             :values (for [id [100 101]]
                       {:id id :name (str "Database " id) :engine "sqlite" :details "{}"
                        :created_at "2026-09-24 00:00:00.000000" :updated_at "2026-09-24 00:00:00.000000"})})
  (t2/query {:insert-into :metabase_table
             :values (for [id [100 101]]
                       {:id id :db_id id :name (str "Table " id) :active true
                        :created_at "2026-09-24 00:00:00.000000" :updated_at "2026-09-24 00:00:00.000000"})})
  (t2/query {:insert-into :data_permissions
             :values [{:group_id 1 :db_id 100 :perm_type "perms/view-data" :perm_value "unrestricted"}
                      {:group_id 1 :db_id 100 :perm_type "perms/create-queries" :perm_value "query-builder"}]})
  (index/with-temp-index-table
    (do
      (specialization/batch-upsert!
       (index/active-table)
       (for [[id name] [[100 "Needle AllowedTable"] [101 "Needle SecretTable"]]]
         (#'index/document->entry
          {:id (str id) :model "table" :name name :database_id id :archived false
           :searchable_text name :display_data {}
           :legacy_input {:id id :model "table" :name name :database_id id :archived false}})))
      (binding [api/*current-user-id* 100 api/*current-user* (delay (t2/select-one :model/User 100))
                api/*current-user-permissions-set* (atom #{}) api/*is-superuser?* false]
        (let [endpoint (api.macros/find-route-fn 'metabase.search.api :get "/")
              params {:q "Needle" :models ["table"] :search_engine "appdb" :calculate_available_models true}
              result (:body (endpoint {} params nil nil))
              denied (:body (endpoint {} (assoc params :q "SecretTable") nil nil))]
          (is (= [100] (mapv :id (:data result))))
          (is (= 1 (:total result)))
          (is (= [] (:data denied)))
          (is (= 0 (:total denied)))
          (is (= #{} (:available_models denied))))))))

(ns metabase.transforms.models.transform-test
  (:require
   [clojure.test :refer :all]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]
   [metabase.transforms-base.query :as transforms-base.query]
   [metabase.transforms.query-test-util :as query-test-util]
   [toucan2.core :as t2]))

(deftest source-database-id-set-test
  (testing "inserting a transform correctly sets the source-database-id column"
    (mt/with-temp [:model/Transform transform
                   {:name   "Test Transform"
                    :source {:type  "query"
                             :query {:database (mt/id)
                                     :type     "native"
                                     :native   {:query "SELECT 1"}}}}]
      (is (= (mt/id) (:source_database_id transform)))))
  (testing "A transform with no source database has a nil source_database_id"
    (mt/with-temp [:model/Transform transform
                   {:name   "Test Transform"
                    :source {:type "python"
                             :body "print(\"hello\")"}}]
      (is (nil? (:source_database_id transform)))))
  (testing "updating a transform recomputes the source-database-id column from the source"
    (mt/with-temp [:model/Transform transform
                   {:name   "Test Transform"
                    :source {:type "python"
                             :body "print(\"hello\")"}}]
      (is (nil? (:source_database_id transform)))
      (t2/update! :model/Transform (:id transform) {:source {:type  "query"
                                                             :query {:database (mt/id)
                                                                     :type     "native"
                                                                     :native   {:query "SELECT 1"}}}})
      (is (= (mt/id) (t2/select-one-fn :source_database_id :model/Transform (:id transform)))))))

(deftest source-database-deletion-sets-null-test
  (testing "deleting a database referenced by a transform nulls the transform's source_database_id (ON DELETE SET NULL)"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Transform transform
                   {:name   "Test Transform"
                    :source {:type  "query"
                             :query {:database db-id
                                     :type     "native"
                                     :native   {:query "SELECT 1"}}}}]
      (is (= db-id (:source_database_id transform)))
      (t2/delete! :model/Database db-id)
      (is (nil? (t2/select-one-fn :source_database_id :model/Transform (:id transform))))
      ;; transform itself still exists
      (is (some? (t2/select-one :model/Transform (:id transform)))))))

(defn- temp-transform-with-index! [thunk]
  (mt/with-temp [:model/Transform {transform-id :id}
                 {:name   (mt/random-name)
                  :source {:type "query" :query (query-test-util/make-query :source-table "venues")}
                  :target {:database (mt/id) :type "table" :schema "public" :name (mt/random-name)}}
                 :model/TableIndex {index-id :id}
                 {:transform_id transform-id
                  :index_name   "by_cat"
                  :status       :succeeded
                  :structured   {:kind :btree :name "by_cat" :columns [{:name "category"}]}}]
    (thunk transform-id index-id)))

(deftest revalidate-indexes-on-schema-change-test
  (testing "editing the source query (output schema may change) marks the transform's managed indexes for revalidation"
    (temp-transform-with-index!
     (fn [transform-id index-id]
       (t2/update! :model/Transform transform-id
                   {:source {:type "query" :query (query-test-util/make-query :source-table "checkins")}})
       (is (= :update-pending (t2/select-one-fn :status :model/TableIndex index-id))))))
  (testing "retargeting to a different table marks the transform's managed indexes for revalidation"
    (temp-transform-with-index!
     (fn [transform-id index-id]
       (t2/update! :model/Transform transform-id
                   {:target {:database (mt/id) :type "table" :schema "public" :name (mt/random-name)}})
       (is (= :update-pending (t2/select-one-fn :status :model/TableIndex index-id))))))
  (testing "an unrelated edit (renaming the transform) leaves the indexes alone"
    (temp-transform-with-index!
     (fn [transform-id index-id]
       (t2/update! :model/Transform transform-id {:name "renamed"})
       (is (= :succeeded (t2/select-one-fn :status :model/TableIndex index-id)))))))

(deftest can-read-write-on-orphaned-transform-test
  (testing "superusers can read/write a transform whose source database has been deleted, data analysts cannot"
    (mt/with-premium-features #{:transforms-basic :hosting}
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/Transform transform
                     {:name   "Orphan Transform"
                      :source {:type  "query"
                               :query {:database db-id
                                       :type     "native"
                                       :native   {:query "SELECT 1"}}}}]
        (t2/delete! :model/Database db-id)
        (let [reloaded (t2/select-one :model/Transform (:id transform))]
          (is (nil? (:source_database_id reloaded)))
          (mt/with-current-user (mt/user->id :crowberto)
            (is (mi/can-read? reloaded))
            (is (mi/can-write? reloaded)))
          (mt/with-current-user (mt/user->id :rasta)
            (is (not (mi/can-read? reloaded)))
            (is (not (mi/can-write? reloaded)))))))))

(deftest execute-fails-clearly-when-source-db-deleted-test
  (testing "running a query transform whose source database has been deleted fails with a clear error"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/Transform transform
                     {:name "Will be orphaned"
                      :source {:type  :query
                               :query {:database db-id
                                       :type     :native
                                       :native   {:query "SELECT 1"}}}}]
        (t2/delete! :model/Database db-id)
        (let [reloaded (t2/select-one :model/Transform (:id transform))
              {:keys [status error]} (transforms-base.query/run-query-transform! reloaded nil)]
          (is (= :failed status))
          (is (re-find #"Source database for this transform has been deleted"
                       (ex-message error))))))))

(deftest no-events-during-deserialization-test
  (testing "Transform lifecycle hooks do not publish events during deserialization"
    (let [events-published (atom [])
          source           {:type  "query"
                            :query {:database (mt/id)
                                    :type     "native"
                                    :native   {:query "SELECT 1"}}}]
      (with-redefs [events/publish-event! (fn [topic event]
                                            (swap! events-published conj [topic event]))]
        (testing "events fire normally for insert/update/delete"
          (mt/with-temp [:model/Transform {transform-id :id} {:name "Test Transform" :source source}]
            (is (some #(= :event/create-transform (first %)) @events-published))
            (reset! events-published [])
            (t2/update! :model/Transform transform-id {:name "Updated Name"})
            (is (some #(= :event/update-transform (first %)) @events-published))
            (reset! events-published [])
            (t2/delete! :model/Transform transform-id)
            (is (some #(= :event/delete-transform (first %)) @events-published))))
        (reset! events-published [])
        (testing "events are suppressed during deserialization"
          (binding [mi/*deserializing?* true]
            (mt/with-temp [:model/Transform {transform-id :id} {:name "Deserialized Transform" :source source}]
              (t2/update! :model/Transform transform-id {:name "Deserialized Update"})
              (t2/delete! :model/Transform transform-id)))
          (is (empty? @events-published)))))))

(defn- stored-deps [transform-id]
  (t2/select-one-fn :table_dependencies :model/Transform transform-id))

(deftest table-dependencies-cache-test
  (testing "table_dependencies is not computed on insert — it is filled lazily on the first read"
    (mt/with-temp [:model/Transform {id :id}
                   {:name   "deps insert"
                    :source {:type  "query"
                             :query {:database (mt/id)
                                     :type     "query"
                                     :query    {:source-table (mt/id :orders)}}}}]
      (is (nil? (stored-deps id)))))
  (testing "changing the source invalidates any cached table_dependencies"
    (mt/with-temp [:model/Transform {id :id}
                   {:name   "deps update"
                    :source {:type  "query"
                             :query {:database (mt/id)
                                     :type     "query"
                                     :query    {:source-table (mt/id :orders)}}}}]
      ;; seed a cached value (as the lazy read path would)
      (t2/update! :model/Transform id {:table_dependencies [{:table (mt/id :orders)}]})
      (is (= [{:table (mt/id :orders)}] (stored-deps id)))
      (t2/update! :model/Transform id
                  {:source {:type  "query"
                            :query {:database (mt/id)
                                    :type     "query"
                                    :query    {:source-table (mt/id :people)}}}})
      (is (nil? (stored-deps id))))))

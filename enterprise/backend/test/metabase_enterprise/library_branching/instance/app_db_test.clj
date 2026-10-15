(ns metabase-enterprise.library-branching.instance.app-db-test
  "The read point of the instance. A read point needs a transaction of its own, so these tests commit their content
  and delete it afterwards; they are not parallel."
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.engine.count :as engine.count]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.instance.app-db :as app-db]
   [metabase-enterprise.library-branching.instance.golden-test :as golden-test]
   [metabase-enterprise.library-branching.scope :as scope]
   [metabase-enterprise.library-branching.snapshot :as snapshot]
   [metabase.app-db.core :as mdb]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.jdbc.query])
  (:import
   (java.sql Connection)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- sum-query
  [table field]
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id table)))
        (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id table field)))))))

(defn- children-location
  [{:keys [id location]}]
  (str location id "/"))

(defn- do-with-committed-content
  "Calls `f` with a function `(insert! model row)` that inserts and commits a row and returns it. Deletes every
  inserted row afterwards, the last first. Also gives `f` the Library collection, made for the call when there is
  none."
  [f]
  (let [rows    (atom ())
        insert! (fn [model row]
                  (let [inserted (t2/insert-returning-instance! model row)]
                    (swap! rows conj [model inserted])
                    inserted))]
    (try
      (let [library (or (t2/select-one :model/Collection :type "library" :archived false)
                        (insert! :model/Collection {:name "Library" :type "library" :location "/"}))]
        (f insert! library))
      (finally
        (doseq [[model row] @rows]
          (case model
            :model/TableUserSettings (t2/delete! :model/TableUserSettings :table_id (:table_id row))
            :model/FieldUserSettings (t2/delete! :model/FieldUserSettings :field_id (:field_id row))
            (t2/delete! model :id (:id row))))))))

(deftest read-snapshot-needs-its-own-transaction-test
  (testing "a read point refuses to run inside an open transaction, whose isolation cannot change"
    (t2/with-transaction [_ nil {:rollback-only true}]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"A read point needs a new transaction"
                            (instance/read-snapshot (app-db/app-db-instance))))))
  (testing "a read point gives the connection back with its isolation and read-only flag as they were"
    (t2/with-connection [^Connection conn]
      (let [before [(.getTransactionIsolation conn) (.isReadOnly conn)]]
        (instance/read-snapshot (app-db/app-db-instance))
        (is (= before [(.getTransactionIsolation conn) (.isReadOnly conn)]))
        (is (not (mdb/in-transaction?)))))))

(deftest count-equals-snapshot-count-test
  (testing "the count of scope equals the item count of read-snapshot, for each kind of the snapshot"
    (do-with-committed-content
     (fn [insert! library]
       (let [user    (mt/user->id :crowberto)
             metrics (insert! :model/Collection {:name     "Count metrics"
                                                 :type     "library-metrics"
                                                 :location (children-location library)})
             data    (insert! :model/Collection {:name     "Count data"
                                                 :type     "library-data"
                                                 :location (children-location library)})
             folder  (insert! :model/Collection {:name "Count snippets" :namespace "snippets" :location "/"})
             outside (insert! :model/Collection {:name "Count outside" :location "/"})
             app     (insert! :model/Collection {:name "Count app" :namespace "data-apps" :location "/"})]
         (insert! :model/Card {:name "In" :type :metric :collection_id (:id metrics) :creator_id user
                               :display :scalar :visualization_settings {} :dataset_query (sum-query :venues :price)})
         (insert! :model/Card {:name "Trashed" :type :metric :collection_id (:id metrics) :creator_id user
                               :archived true :display :scalar :visualization_settings {}
                               :dataset_query (sum-query :venues :price)})
         (insert! :model/Card {:name "Outside" :type :metric :collection_id (:id outside) :creator_id user
                               :display :scalar :visualization_settings {} :dataset_query (sum-query :venues :price)})
         (insert! :model/Card {:name "Question" :type :question :collection_id (:id app) :creator_id user
                               :display :table :visualization_settings {} :dataset_query (sum-query :venues :price)})
         (insert! :model/Card {:name "Model" :type :model :collection_id (:id app) :creator_id user
                               :display :table :visualization_settings {} :dataset_query (sum-query :venues :price)})
         (insert! :model/NativeQuerySnippet {:name (str "Count root snippet " (random-uuid)) :content "1 = 1" :creator_id user})
         (insert! :model/NativeQuerySnippet {:name (str "Count folder snippet " (random-uuid)) :content "2 = 2" :creator_id user
                                             :collection_id (:id folder)})
         (insert! :model/TableUserSettings {:table_id (mt/id :venues) :is_published true :collection_id (:id data)})
         (insert! :model/Glossary {:term (str "Count term " (random-uuid)) :definition "Counted." :creator_id user})
         (insert! :model/Segment {:name "Count segment" :table_id (mt/id :venues) :creator_id user
                                  :definition (let [mp (mt/metadata-provider)]
                                                (lib/filter (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                                                            (lib/< (lib.metadata/field mp (mt/id :venues :price)) 2)))})
         (insert! :model/Segment {:name "Count users segment" :table_id (mt/id :users) :creator_id user
                                  :definition (let [mp (mt/metadata-provider)]
                                                (lib/filter (lib/query mp (lib.metadata/table mp (mt/id :users)))
                                                            (lib/< (lib.metadata/field mp (mt/id :users :id)) 2)))})
         (insert! :model/Measure {:name "Count measure" :table_id (mt/id :venues) :creator_id user
                                  :definition (sum-query :venues :price)})
         (insert! :model/Measure {:name "Count trashed measure" :table_id (mt/id :venues) :creator_id user
                                  :archived true :definition (sum-query :venues :price)})
         (let [{:keys [snapshot]} (instance/read-snapshot (app-db/app-db-instance))
               counts             (engine.count/count-by-kind snapshot)]
           (is (= (select-keys (scope/scope-count) snapshot/kinds) counts))
           (is (every? pos? (vals counts)))))))))

(defn- pause-after-first-query!
  "A replacement of `library-branching.db/rows` that, after its first query, delivers `paused` and waits (at most
  60 s) for `resume`."
  [paused resume]
  (let [rows   (mt/original-fn #'library-branching.db/rows)
        first? (atom true)]
    (fn [query]
      (let [result (rows query)]
        (when (compare-and-set! first? true false)
          (deliver paused true)
          (deref resume 60000 nil))
        result))))

(defn- venues-key
  "The natural key of the table venues, the identity of its published table."
  []
  (let [{:keys [db_id schema name]} (t2/select-one [:model/Table :db_id :schema :name] (mt/id :venues))]
    [(t2/select-one-fn :name :model/Database db_id) schema name]))

(deftest save-during-read-is-not-in-snapshot-test
  (testing (str "a save of each kind that commits while read-snapshot runs, after its first query, is not in the "
                "snapshot; app DB " (mdb/db-type))
    (do-with-committed-content
     (fn [insert! library]
       (let [user       (mt/user->id :crowberto)
             collection (insert! :model/Collection {:name     "Before"
                                                    :type     "library-metrics"
                                                    :location (children-location library)})
             data       (insert! :model/Collection {:name     "Read point data"
                                                    :type     "library-data"
                                                    :location (children-location library)})
             metric     (insert! :model/Card {:name                   "Before"
                                              :type                   :metric
                                              :collection_id          (:id collection)
                                              :creator_id             user
                                              :display                :scalar
                                              :visualization_settings {}
                                              :dataset_query          (sum-query :venues :price)})
             _          (insert! :model/TableUserSettings {:table_id      (mt/id :venues)
                                                           :is_published  true
                                                           :collection_id (:id data)
                                                           :display_name  "Before"})
             venues     (venues-key)
             paused     (promise)
             saved      (promise)
             ;; A raw thread: it shares no connection and no redefinition with the reader.
             writer     (Thread. ^Runnable
                         (fn []
                           (deliver saved
                                    (try
                                      (when (deref paused 60000 nil)
                                        (t2/update! :model/Card (:id metric) {:name "After"})
                                        (t2/update! :model/Collection (:id collection) {:name "After"})
                                        (t2/update! :model/TableUserSettings (mt/id :venues) {:display_name "After"})
                                        (insert! :model/FieldUserSettings {:field_id     (mt/id :venues :price)
                                                                           :display_name "Price level"})
                                        {:snippet (insert! :model/NativeQuerySnippet
                                                           {:name       (str "After " (random-uuid))
                                                            :content    "1 = 1"
                                                            :creator_id user})
                                         :term    (insert! :model/Glossary {:term       (str "After " (random-uuid))
                                                                            :definition "Saved during the read."
                                                                            :creator_id user})})
                                      (catch Throwable e e)))))
             _          (.start writer)
             {:keys [snapshot]} (mt/with-dynamic-fn-redefs [library-branching.db/rows (pause-after-first-query! paused saved)]
                                  (instance/read-snapshot (app-db/app-db-instance)))
             {:keys [snippet term] :as saves} (deref saved 60000 nil)]
         (.join writer 60000)
         (is (map? saves) "the saves committed while the read waited")
         (is (= "Before" (:name (get snapshot (:entity_id metric)))))
         (is (= "Before" (:name (get snapshot (:entity_id collection)))))
         (is (= "Before" (:name (get snapshot venues))))
         (is (empty? (get-in snapshot [venues :attrs :fields])))
         (is (not (contains? snapshot (:entity_id snippet))))
         (is (not (contains? snapshot (:entity_id term))))
         (testing "a read after the saves sees them"
           (let [{after :snapshot} (instance/read-snapshot (app-db/app-db-instance))]
             (is (= "After" (:name (get after (:entity_id metric)))))
             (is (= "After" (:name (get after (:entity_id collection)))))
             (is (= "After" (:name (get after venues))))
             (is (seq (get-in after [venues :attrs :fields])))
             (is (contains? after (:entity_id snippet)))
             (is (contains? after (:entity_id term))))))))))

(defn- tables-of-sql
  "The names of the tables that SQL text `sql` reads, as lower-case keywords: each name after FROM or JOIN."
  [sql]
  (into #{}
        (map (comp keyword u/lower-case-en second))
        (re-seq #"(?i)\b(?:FROM|JOIN)\s+[\"`]?([A-Za-z_][A-Za-z0-9_]*)" sql)))

(defn- tables-read
  "The names of the tables that the statements of `(thunk)` read, from the SQL that toucan2's JDBC backend executes."
  [thunk]
  (let [tables            (atom #{})
        reduce-jdbc-query (mt/original-fn #'toucan2.jdbc.query/reduce-jdbc-query)]
    (mt/with-dynamic-fn-redefs [toucan2.jdbc.query/reduce-jdbc-query
                                (fn [rf init conn model sql-args opts]
                                  (swap! tables into (tables-of-sql (first sql-args)))
                                  (reduce-jdbc-query rf init conn model sql-args opts))]
      (thunk))
    @tables))

(deftest read-models-hold-the-tables-of-each-read-test
  (testing "each table that the read of a kind reads is the table of a model of its read-models, so the read point reads it first"
    (golden-test/do-with-golden-content
     (fn [_]
       (doseq [[kind ks] (sort-by key app-db/kind-stores)]
         (testing kind
           (let [read (tables-read #(app-db/read-current {kind ks} scope/roots))]
             (is (seq read))
             (is (empty? (set/difference read (into #{} (map t2/table-name) (instance/read-models ks))))))))))))

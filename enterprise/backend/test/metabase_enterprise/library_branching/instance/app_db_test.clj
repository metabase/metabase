(ns metabase-enterprise.library-branching.instance.app-db-test
  "The read point of the instance. A read point needs a transaction of its own, so these tests commit their content
  and delete it afterwards; they are not parallel."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.engine.count :as engine.count]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.instance.app-db :as app-db]
   [metabase-enterprise.library-branching.scope :as scope]
   [metabase-enterprise.library-branching.snapshot :as snapshot]
   [metabase.app-db.core :as mdb]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2])
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
          (if (= :model/TableUserSettings model)
            (t2/delete! :model/TableUserSettings :table_id (:table_id row))
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
             outside (insert! :model/Collection {:name "Count outside" :location "/"})]
         (insert! :model/Card {:name "In" :type :metric :collection_id (:id metrics) :creator_id user
                               :display :scalar :visualization_settings {} :dataset_query (sum-query :venues :price)})
         (insert! :model/Card {:name "Trashed" :type :metric :collection_id (:id metrics) :creator_id user
                               :archived true :display :scalar :visualization_settings {}
                               :dataset_query (sum-query :venues :price)})
         (insert! :model/Card {:name "Outside" :type :metric :collection_id (:id outside) :creator_id user
                               :display :scalar :visualization_settings {} :dataset_query (sum-query :venues :price)})
         (insert! :model/NativeQuerySnippet {:name (str "Count root snippet " (random-uuid)) :content "1 = 1" :creator_id user})
         (insert! :model/NativeQuerySnippet {:name (str "Count folder snippet " (random-uuid)) :content "2 = 2" :creator_id user
                                             :collection_id (:id folder)})
         (insert! :model/TableUserSettings {:table_id (mt/id :venues) :is_published true :collection_id (:id data)})
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

(deftest save-during-read-is-not-in-snapshot-test
  (testing (str "a save that commits while read-snapshot runs, after its first query, is not in the snapshot; app DB "
                (mdb/db-type))
    (do-with-committed-content
     (fn [insert! library]
       (let [user       (mt/user->id :crowberto)
             collection (insert! :model/Collection {:name     "Before"
                                                    :type     "library-metrics"
                                                    :location (children-location library)})
             metric     (insert! :model/Card {:name                   "Before"
                                              :type                   :metric
                                              :collection_id          (:id collection)
                                              :creator_id             user
                                              :display                :scalar
                                              :visualization_settings {}
                                              :dataset_query          (sum-query :venues :price)})
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
                                        (insert! :model/NativeQuerySnippet {:name       (str "After " (random-uuid))
                                                                            :content    "1 = 1"
                                                                            :creator_id user}))
                                      (catch Throwable e e)))))
             _          (.start writer)
             {:keys [snapshot]} (mt/with-dynamic-fn-redefs [library-branching.db/rows (pause-after-first-query! paused saved)]
                                  (instance/read-snapshot (app-db/app-db-instance)))
             snippet    (deref saved 60000 nil)]
         (.join writer 60000)
         (is (map? snippet) "the save committed while the read waited")
         (is (= "Before" (:name (get snapshot (:entity_id metric)))))
         (is (= "Before" (:name (get snapshot (:entity_id collection)))))
         (is (not (contains? snapshot (:entity_id snippet))))
         (testing "a read after the save sees it"
           (let [{after :snapshot} (instance/read-snapshot (app-db/app-db-instance))]
             (is (= "After" (:name (get after (:entity_id metric)))))
             (is (= "After" (:name (get after (:entity_id collection)))))
             (is (contains? after (:entity_id snippet))))))))))

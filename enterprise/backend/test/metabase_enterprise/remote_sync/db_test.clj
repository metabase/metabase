(ns metabase-enterprise.remote-sync.db-test
  "Values reaching the app DB from [[metabase-enterprise.remote-sync.db]] are bound as parameters rather than
  compiled into the statement, so a value that looks like SQL matches nothing instead of changing the query."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.db :as remote-sync.db]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private sql-ish
  "A value shaped like SQL. Bound as a parameter it matches nothing; compiled into the statement it would change
  which rows the query returns."
  "x' OR '1'='1")

(deftest model-type-is-bound-test
  (testing "a `model-type` that looks like SQL matches no RemoteSyncObject"
    (mt/with-temp [:model/RemoteSyncObject _ {:model_type        "Card"
                                              :model_id          1
                                              :status            "synced"
                                              :model_name        "One"
                                              :status_changed_at (t/offset-date-time)}]
      (is (nil? (remote-sync.db/rso sql-ish 1)))
      (is (false? (remote-sync.db/rso-exists? sql-ish 1)))
      (is (false? (remote-sync.db/rso-of-type-exists? sql-ish)))
      (is (zero? (remote-sync.db/rso-count-of-type sql-ish)))
      (is (empty? (remote-sync.db/tracked-model-ids sql-ish)))
      (testing "and the real `model-type` still matches, so binding did not break the query"
        (is (some? (remote-sync.db/rso "Card" 1)))
        (is (pos? (remote-sync.db/rso-count-of-type "Card")))))))

(deftest file-path-is-bound-test
  (testing "a `file-path` that looks like SQL matches no RemoteSyncObject"
    (mt/with-temp [:model/RemoteSyncObject _ {:model_type        "Card"
                                              :model_id          1
                                              :status            "synced"
                                              :file_path         "cards/one.yaml"
                                              :model_name        "One"
                                              :status_changed_at (t/offset-date-time)}]
      (is (nil? (remote-sync.db/rso-by-file-path sql-ish)))
      (is (some? (remote-sync.db/rso-by-file-path "cards/one.yaml"))))))

(deftest namespace-name-is-bound-test
  (testing "a `namespace-name` that looks like SQL matches no Collection"
    (mt/with-temp [:model/Collection _ {:namespace "snippets"}]
      (is (empty? (remote-sync.db/collections-in-namespace sql-ish)))
      (is (empty? (remote-sync.db/collection-ids-in-namespace sql-ish)))
      (is (empty? (remote-sync.db/unarchived-root-collection-ids-in-namespace sql-ish)))
      (testing "and the real namespace still matches"
        (is (seq (remote-sync.db/collections-in-namespace "snippets")))))))

(deftest library-type-is-bound-test
  (testing "a `library-type` that looks like SQL matches no Collection"
    (is (nil? (remote-sync.db/library-collection sql-ish)))))

(deftest entity-ids-are-bound-test
  (testing "an `entity-id` that looks like SQL matches no instance"
    (mt/with-temp [:model/Collection {entity-id :entity_id} {}]
      (is (empty? (remote-sync.db/existing-entity-ids :model/Collection #{sql-ish})))
      (is (empty? (remote-sync.db/ids-by-entity-ids :model/Collection #{sql-ish})))
      (testing "and a real entity-id still matches, so the IN list still binds each element"
        (is (= #{entity-id}
               (remote-sync.db/existing-entity-ids :model/Collection #{entity-id sql-ish})))))))

(deftest excluded-model-types-are-bound-test
  (testing "an excluded `model-type` that looks like SQL excludes nothing"
    (mt/with-temp [:model/RemoteSyncObject _ {:model_type        "Card"
                                              :model_id          1
                                              :status            "removed"
                                              :model_name        "One"
                                              :status_changed_at (t/offset-date-time)}]
      (is (true? (remote-sync.db/dirty-rso-exists? #{sql-ish})))
      (is (seq (remote-sync.db/dirty-rsos #{sql-ish})))
      (testing "and a real excluded model-type still excludes"
        (is (false? (remote-sync.db/dirty-rso-exists? #{"Card"})))))))

(deftest path-values-are-bound-test
  (testing "a `db_name` or `table_name` that looks like SQL matches no Table"
    (mt/with-temp [:model/Database {db-id :id} {:name "db"}
                   :model/Table    {table-id :id} {:db_id db-id :name "t"}
                   :model/Field    _ {:table_id table-id :name "f"}]
      (is (empty? (remote-sync.db/tables-at-paths [{:db_name    sql-ish
                                                    :schema     sql-ish
                                                    :table_name sql-ish}])))
      (is (empty? (remote-sync.db/fields-at-paths [{:db_name    sql-ish
                                                    :schema     sql-ish
                                                    :table_name sql-ish
                                                    :field_name sql-ish}])))
      (testing "and a real path still matches, so binding did not break the join"
        (is (= [table-id] (map :id (remote-sync.db/tables-at-paths
                                    [{:db_name "db" :table_name "t"}]))))))))

(deftest cutoff-is-bound-test
  (testing "a temporal cutoff still selects and deletes by comparison rather than by compiled text"
    (mt/with-temp [:model/RemoteSyncTask _ {:sync_task_type "export"
                                            :started_at     (t/minus (t/offset-date-time) (t/days 2))}]
      (is (nat-int? (remote-sync.db/delete-tasks-started-before!
                     (t/minus (t/offset-date-time) (t/days 1))))))))

(deftest model-id-sentinel-is-coerced-test
  (testing "`ModelId` admits the -1 Transforms-root sentinel, and coercing it preserves the match"
    (mt/with-temp [:model/RemoteSyncObject _ {:model_type        "Collection"
                                              :model_id          -1
                                              :status            "synced"
                                              :model_name        "Transforms"
                                              :status_changed_at (t/offset-date-time)}]
      (is (some? (remote-sync.db/rso "Collection" -1)))
      (is (true? (remote-sync.db/rso-exists? "Collection" -1)))
      (testing "and a `model-type` that looks like SQL still matches nothing at the sentinel"
        (is (nil? (remote-sync.db/rso sql-ish -1)))))))

(deftest set-rsos-status!-filters-on-the-ids-it-is-given
  (testing "the conditions map filters, rather than being read as a column named :where"
    (mt/with-temp [:model/RemoteSyncObject {a :id} {:model_type "Card" :model_id 1 :model_name "One"
                                                    :status "pending" :status_changed_at (t/offset-date-time)}
                   :model/RemoteSyncObject {b :id} {:model_type "Card" :model_id 2 :model_name "Two"
                                                    :status "pending" :status_changed_at (t/offset-date-time)}]
      (is (= 1 (remote-sync.db/set-rsos-status! [a] "synced" (t/offset-date-time))))
      (is (= "synced" (t2/select-one-fn :status :model/RemoteSyncObject :id a)))
      (is (= "pending" (t2/select-one-fn :status :model/RemoteSyncObject :id b))))))

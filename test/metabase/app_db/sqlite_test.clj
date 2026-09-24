(ns metabase.app-db.sqlite-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [honey.sql :as sql]
   [metabase.app-db.connection :as connection]
   [metabase.app-db.data-source :as data-source]
   [metabase.app-db.jdbc-protocols]
   [metabase.app-db.setup :as setup]
   [metabase.app-db.sql-errors :as sql-errors]
   [metabase.util.honey-sql-2 :as h2x]
   [methodical.core :as methodical]
   [toucan2.connection :as t2.conn]
   [toucan2.core :as t2]
   [toucan2.pipeline :as t2.pipeline])
  (:import
   (java.time LocalDateTime OffsetDateTime)))

(set! *warn-on-reflection* true)

(defn- with-sqlite [f]
  (let [ds (data-source/broken-out-details->DataSource :sqlite {:db ":memory:"})]
    (with-open [^java.sql.Connection conn (.getConnection ds)]
      (binding [connection/*application-db* (connection/application-db :sqlite ds)
                t2.conn/*current-connectable* conn]
        (f conn)))))

(deftest connection-and-constraints-test
  (with-sqlite
    (fn [^java.sql.Connection conn]
      (is (= java.sql.Connection/TRANSACTION_SERIALIZABLE (.getTransactionIsolation conn)))
      (is (= [{:foreign_keys 1}] (t2/query ["PRAGMA foreign_keys"])))
      (t2/query ["CREATE TABLE parent (id INTEGER PRIMARY KEY)"])
      (t2/query ["CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id))"])
      (is (thrown? Exception (t2/insert! :child {:parent_id 999}))))))

(deftest temporal-and-boolean-roundtrip-test
  (with-sqlite
    (fn [_]
      (t2/query ["CREATE TABLE probe (id INTEGER PRIMARY KEY, enabled BOOLEAN, local TIMESTAMP, instant TIMESTAMP WITH TIME ZONE)"])
      (let [local (LocalDateTime/parse "2026-09-24T12:34:56.123456")
            instant (OffsetDateTime/parse "2026-09-24T12:34:56.123456-04:00")]
        (is (= [1] (t2/insert-returning-pks! :probe {:enabled false :local local :instant instant})))
        (is (= {:id 1 :enabled false :local local :instant (.withOffsetSameInstant instant java.time.ZoneOffset/UTC)}
               (into {} (t2/select-one :probe :id 1))))
        (is (= {:enabled nil :local nil :instant nil}
               (do (t2/insert! :probe {:id 2})
                   (select-keys (t2/select-one :probe :id 2) [:enabled :local :instant]))))
        (is (= "2026-09-24 16:34:56.123456"
               (:instant (first (jdbc/query {:connection t2.conn/*current-connectable*}
                                            ["SELECT instant FROM probe WHERE id = 1"])))))))))

(deftest transaction-and-locking-read-test
  (with-sqlite
    (fn [_]
      (t2/query ["CREATE TABLE probe (id INTEGER PRIMARY KEY, value INTEGER)"])
      (t2/insert! :probe {:id 1 :value 0})
      (t2/with-transaction [_]
        (is (= 0 (:value (t2/select-one :probe :id 1 {:for :update}))))
        (t2/with-transaction [_ nil {:rollback-only true}]
          (t2/update! :probe 1 {:value 2}))
        (is (= 0 (:value (t2/select-one :probe :id 1))))
        (t2/update! :probe 1 {:value 3}))
      (is (= 3 (:value (t2/select-one :probe :id 1))))
      (is (thrown-with-msg? Exception #"locking reads require"
                            (t2/select-one :probe :id 1 {:for :update}))))))

(deftest sql-functions-test
  (with-sqlite
    (fn [_]
      (is (= "2026-09-25 12:34:56.123000"
             (:value (t2/query-one {:select [[(h2x/add-interval-honeysql-form
                                               :sqlite "2026-09-24 12:34:56.123000" 1 :day) :value]]}))))
      (is (re-matches #"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}"
                      (:value (t2/query-one {:select [[(h2x/current-datetime-honeysql-form :sqlite) :value]]})))))))

(deftest error-classification-test
  (with-sqlite
    (fn [_]
      (t2/query ["CREATE TABLE probe (id INTEGER PRIMARY KEY)"])
      (t2/insert! :probe {:id 1})
      (is (= :duplicate-key (try (t2/insert! :probe {:id 1})
                                 (catch Exception e (sql-errors/error-kind e)))))
      (is (= :table-not-found (try (t2/query ["SELECT * FROM does_not_exist"])
                                   (catch Exception e (sql-errors/error-kind e))))))))

(deftest bulk-insert-returning-test
  (with-sqlite
    (fn [_]
      (t2/query ["CREATE TABLE probe (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, enabled BOOLEAN DEFAULT 1)"])
      (t2/insert! :probe {:id 40 :name "existing"})
      (testing "bulk inserts return every generated primary key, including after explicit-ID imports"
        (is (= [41 42 43]
               (t2/insert-returning-pks! :probe [{:name "first"} {:name "second"} {:name "third"}]))))
      (testing "returned instances include generated IDs and database defaults"
        (is (= [{:id 44 :name "fourth" :enabled true}
                {:id 45 :name "fifth" :enabled true}]
               (mapv #(into {} %) (t2/insert-returning-instances! :probe [{:name "fourth"} {:name "fifth"}])))))
      (testing "returned instances preserve explicitly false and null fields"
        (is (= [{:id 46 :name nil :enabled false}
                {:id 47 :name "nullable" :enabled nil}]
               (mapv #(into {} %) (t2/insert-returning-instances! :probe [{:name nil :enabled false}
                                                                          {:name "nullable" :enabled nil}])))))
      (is (= 8 (t2/count :probe))))))

(defn- update-returning-instances!
  ;; Toucan uses this query type for after-update hooks but does not expose a public convenience function yet.
  [& args]
  (t2.pipeline/transduce-unparsed-with-default-rf :toucan.query-type/update.instances args))

(deftest update-returning-test
  (with-sqlite
    (fn [_]
      (t2/query ["CREATE TABLE probe (id INTEGER PRIMARY KEY, value INTEGER, enabled BOOLEAN)"])
      (t2/insert! :probe [{:id 1 :value 10 :enabled true}
                          {:id 2 :value 20 :enabled true}
                          {:id 3 :value 30 :enabled true}])
      (testing "updates return the keys of all matching rows, leaving unmatched rows alone"
        (is (= #{1 3} (set (t2/update-returning-pks! :probe :id [:in [1 3]] {:value [:+ :value 5]}))))
        (is (= [{:id 1 :value 15 :enabled true}
                {:id 2 :value 20 :enabled true}
                {:id 3 :value 35 :enabled true}]
               (mapv #(into {} %) (t2/select :probe {:order-by [:id]})))))
      (testing "returned instances contain values after the update"
        (is (= [{:id 1 :value 15 :enabled false}
                {:id 3 :value 35 :enabled false}]
               (->> (update-returning-instances! :probe :id [:in [1 3]] {:enabled false})
                    (sort-by :id)
                    (mapv #(into {} %))))))
      (testing "updates matching no rows return no keys or instances"
        (is (empty? (t2/update-returning-pks! :probe :id 999 {:value 0})))
        (is (empty? (update-returning-instances! :probe :id 999 {:value 0})))))))

;; A test-only model lets the fixture exercise real Toucan hooks without loading application models.
#_{:clj-kondo/ignore [:metabase/toucan-model-ns]}
(methodical/defmethod t2/table-name ::HookedProbe [_model] :probe)

(t2/define-after-update ::HookedProbe
  [{:keys [id value] :as row}]
  ;; Opening this nested savepoint fails with SQLITE_BUSY if DML RETURNING is still streaming.
  (t2/with-transaction [_]
    (t2/insert! :probe_audit {:probe_id id :value value}))
  row)

(deftest update-returning-with-nested-transaction-hooks-test
  (with-sqlite
    (fn [_]
      (t2/query ["CREATE TABLE probe (id INTEGER PRIMARY KEY, value INTEGER)"])
      (t2/query ["CREATE TABLE probe_audit (id INTEGER PRIMARY KEY, probe_id INTEGER REFERENCES probe(id), value INTEGER)"])
      (t2/insert! :probe [{:id 1 :value 10} {:id 2 :value 20}])
      (testing "every after-update hook can start a nested transaction after RETURNING is consumed"
        (t2/with-transaction [_]
          (is (= [{:id 1 :value 11} {:id 2 :value 21}]
                 (->> (update-returning-instances! ::HookedProbe {:value [:+ :value 1]})
                      (sort-by :id)
                      (mapv #(into {} %))))))
        (is (= [{:probe_id 1 :value 11} {:probe_id 2 :value 21}]
               (mapv #(select-keys % [:probe_id :value]) (t2/select :probe_audit {:order-by [:probe_id]})))))
      (testing "nested rollback reverts the update and all writes made by its hooks"
        (t2/with-transaction [_]
          (t2/with-transaction [_ nil {:rollback-only true}]
            (is (= #{1 2} (set (t2/update-returning-pks! ::HookedProbe {:value 100})))))
          (is (= 2 (t2/count :probe_audit))))
        (is (= [{:id 1 :value 11} {:id 2 :value 21}]
               (mapv #(into {} %) (t2/select :probe {:order-by [:id]}))))))))

(def ^:private static-timestamp-defaults
  ;; Mirrors model defaults such as User.date_joined: compiled before the application DB is selected.
  {:timestamp :%now})

(deftest app-db-now-expressions-test
  (with-sqlite
    (fn [_]
      (t2/query ["CREATE TABLE probe (id INTEGER PRIMARY KEY, timestamp TIMESTAMP WITH TIME ZONE)"])
      (let [rows (t2/insert-returning-instances! :probe [static-timestamp-defaults {:timestamp [:now]}])]
        (is (= 2 (count rows)))
        (is (every? #(instance? OffsetDateTime (:timestamp %)) rows)))
      (is (instance? OffsetDateTime
                     (:timestamp (first (update-returning-instances! :probe :id 1 {:timestamp :%now})))))
      (is (re-matches #"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}"
                      (:now (t2/query-one {:select [[[:now] :now]]}))))
      (testing "warehouse SQL formatting is unaffected by the application database"
        (is (= ["NOW()"] (sql/format-expr :%now)))
        (is (= ["NOW()"] (sql/format-expr [:now])))))))

(deftest now-expression-literal-boundaries-test
  (testing "data and raw SQL must not be rewritten as app DB expressions"
    (doseq [form [[:lift {:default :%now :vector [:now]}]
                  [:inline :%now]
                  [:param :%now]
                  [:raw "NOW()"]]]
      (is (= form (#'setup/sqlite-current-datetime-forms form))))))

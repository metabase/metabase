(ns metabase.app-db.dml-capture-test
  "Pins the statement-level DML capture contract documented in [[metabase.app-db.dml-capture]].
  Not parallel: the suite mutates the global hierarchy and shares one scratch table across tests."
  (:require
   [clojure.test :refer :all]
   [mb.hawk.assert-exprs]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.dml-capture :as dml-capture]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.model :as t2.model]))

(set! *warn-on-reflection* true)

(def ^:private table-name "dml_capture_test_bird")

;;; `::bird` is a clean model carrying only capture. `::moody-bird` shares the same table but additionally
;;; registers toucan2 row-level tools, so composition tests keep `::bird`'s preconditions obvious.
(methodical/defmethod t2.model/table-name ::bird [_] table-name)
(methodical/defmethod t2.model/table-name ::moody-bird [_] table-name)

(def ^:private captured
  "Events delivered by [[dml-capture/captured!]] for the scratch models, in order."
  (atom []))

(def ^:private bird-capture-fields
  "Per-op `capture-fields` for `::bird`, so a test can switch an op off without redefining a method."
  (atom {:insert [:id :group_id]
         :update [:id :group_id]
         :delete [:id :group_id]}))

(def ^:private moody-before-update-fn
  "The row rewrite `::moody-bird`'s before-update applies; identity unless a composition test sets it."
  (atom identity))

(def ^:private after-insert-count (atom 0))

(defmethod dml-capture/capture-fields ::bird [_ op] (get @bird-capture-fields op))
(defmethod dml-capture/capture-fields ::moody-bird [_ _op] [:id :group_id])

(defmethod dml-capture/captured! ::bird [_ event] (swap! captured conj event))
(defmethod dml-capture/captured! ::moody-bird [_ event] (swap! captured conj event))

(t2/define-before-update ::moody-bird [row] (@moody-before-update-fn row))
(t2/define-before-delete ::moody-bird [row] row)
(t2/define-after-insert ::moody-bird [row] (swap! after-insert-count inc) row)

(defn- reset-capture! []
  (reset! captured [])
  (reset! bird-capture-fields {:insert [:id :group_id]
                               :update [:id :group_id]
                               :delete [:id :group_id]})
  (reset! moody-before-update-fn identity)
  (reset! after-insert-count 0))

(defn- events [] @captured)

(defn- create-table-sql []
  (case (mdb/db-type)
    :postgres (str "CREATE TABLE " table-name
                   " (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL,"
                   " group_id INT NOT NULL, n INT NOT NULL DEFAULT 0)")
    :h2       (str "CREATE TABLE \"" table-name "\""
                   " (\"id\" BIGINT AUTO_INCREMENT PRIMARY KEY, \"name\" VARCHAR(255) NOT NULL,"
                   " \"group_id\" INT NOT NULL, \"n\" INT NOT NULL DEFAULT 0)")
    :mysql    (str "CREATE TABLE " table-name
                   " (id BIGINT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL,"
                   " group_id INT NOT NULL, n INT NOT NULL DEFAULT 0)")))

(defn- drop-table-sql []
  (if (= :h2 (mdb/db-type))
    (str "DROP TABLE IF EXISTS \"" table-name "\"")
    (str "DROP TABLE IF EXISTS " table-name)))

(use-fixtures :once
  (fn [thunk]
    (t2/query [(drop-table-sql)])
    (t2/query [(create-table-sql)])
    (derive ::bird dml-capture/hook)
    (derive ::moody-bird dml-capture/hook)
    (try
      (thunk)
      (finally
        (underive ::bird dml-capture/hook)
        (underive ::moody-bird dml-capture/hook)
        (t2/query [(drop-table-sql)])))))

(defn- bird [group-id n name-str] {:name name-str, :group_id group-id, :n n})

(deftest insert-multi-row-single-event-test
  (reset-capture!)
  (testing "a multi-row insert returns the count and delivers exactly one :insert event"
    (let [rows [(bird 10 0 "a") (bird 10 0 "b") (bird 10 0 "c")]]
      (is (= 3 (t2/insert! ::bird rows)))
      (is (= 1 (count (events))))
      (let [{:keys [pks] :as event} (first (events))]
        (is (=? {:op    :insert
                 :model ::bird
                 :rows  [(assoc (bird 10 0 "a") :id pos-int?)
                         (assoc (bird 10 0 "b") :id pos-int?)
                         (assoc (bird 10 0 "c") :id pos-int?)]
                 :pks   [pos-int? pos-int? pos-int?]}
                event))
        (testing "the pks are the ids assoc'd onto the row literals, in order"
          (is (= pks (mapv :id (:rows event)))))))))

(deftest insert-adds-no-queries-test
  (reset-capture!)
  (testing "capturing a single-row insert runs exactly one SQL statement"
    (t2/with-call-count [call-count]
      (is (= 1 (t2/insert! ::bird (bird 20 0 "x"))))
      (is (= 1 (call-count))))
    (is (= 1 (count (events))))))

(deftest insert-returning-pks-passthrough-test
  (reset-capture!)
  (testing "insert-returning-pks! returns the pks unchanged and fires one event"
    (let [pks (t2/insert-returning-pks! ::bird [(bird 30 0 "a") (bird 30 0 "b")])]
      (is (= 2 (count pks)))
      (is (= 1 (count (events))))
      (is (=? {:op :insert, :pks pks} (first (events)))))))

(deftest insert-returning-instances-passthrough-test
  (reset-capture!)
  (testing "insert-returning-instances! returns the instances unchanged and fires one event, not two"
    (let [instances (t2/insert-returning-instances! ::bird [(bird 31 0 "a") (bird 31 0 "b")])]
      (is (= 2 (count instances)))
      (is (= #{"a" "b"} (set (map :name instances))))
      (is (= 1 (count (events))))
      (is (=? {:op :insert} (first (events)))))))

(deftest bulk-update-statement-level-changes-test
  (reset-capture!)
  (testing "a bulk update delivers one :update event with the statement's changes and narrow pre-image rows"
    (t2/insert! ::bird [(bird 40 0 "a") (bird 40 0 "b") (bird 40 0 "c")])
    (reset! captured [])
    (is (= 3 (t2/update! ::bird :group_id 40 {:n 5})))
    (is (= 1 (count (events))))
    (let [{:keys [changes rows] :as event} (first (events))]
      (is (=? {:op :update, :model ::bird} event))
      (testing "changes is exactly the requested changes, not the full row and not empty"
        (is (= {:n 5} changes)))
      (testing "each pre-image row carries only the requested capture-fields"
        (is (= 3 (count rows)))
        (is (every? #(= #{:id :group_id} (set (keys %))) rows))
        (is (every? #(= 40 (:group_id %)) rows))))))

(deftest update-and-delete-statement-counts-test
  (testing "a captured update runs two statements (narrow select + update)"
    (reset-capture!)
    (t2/insert! ::bird [(bird 50 0 "a") (bird 50 0 "b")])
    (t2/with-call-count [call-count]
      (t2/update! ::bird :group_id 50 {:n 1})
      (is (= 2 (call-count)))))
  (testing "a captured delete runs two statements (narrow select + delete)"
    (reset-capture!)
    (t2/insert! ::bird [(bird 51 0 "a") (bird 51 0 "b")])
    (t2/with-call-count [call-count]
      (t2/delete! ::bird :group_id 51)
      (is (= 2 (call-count)))))
  (testing "a delete whose capture-fields returns nil runs one statement and fires nothing"
    (reset-capture!)
    (swap! bird-capture-fields assoc :delete nil)
    (t2/insert! ::bird [(bird 52 0 "a") (bird 52 0 "b")])
    (reset! captured [])
    (t2/with-call-count [call-count]
      (t2/delete! ::bird :group_id 52)
      (is (= 1 (call-count))))
    (is (empty? (events)))))

(deftest zero-rows-no-event-test
  (testing "an update matching zero rows returns 0 and delivers no event"
    (reset-capture!)
    (is (= 0 (t2/update! ::bird :group_id 60 {:n 5})))
    (is (empty? (events))))
  (testing "a delete matching zero rows delivers no event"
    (reset-capture!)
    (is (= 0 (t2/delete! ::bird :group_id 61)))
    (is (empty? (events)))))

(deftest empty-changes-no-event-no-select-test
  (reset-capture!)
  (testing "an update with an empty changes map delivers no event and runs no capture select"
    (t2/insert! ::bird [(bird 70 0 "a") (bird 70 0 "b")])
    (reset! captured [])
    (t2/with-call-count [call-count]
      (t2/update! ::bird :group_id 70 {})
      (testing "at most the update itself runs, never an extra capture select"
        (is (>= 1 (call-count)))))
    (is (empty? (events)))))

(deftest delete-by-pk-and-by-honeysql-test
  (testing "delete by a pk arg captures the pre-image rows"
    (reset-capture!)
    (let [id (first (t2/insert-returning-pks! ::bird (bird 80 0 "a")))]
      (reset! captured [])
      (is (= 1 (t2/delete! ::bird id)))
      (is (=? {:op :delete, :model ::bird, :rows [{:id id, :group_id 80}]} (first (events))))))
  (testing "delete with a honeysql where-map captures the pre-image rows"
    (reset-capture!)
    (t2/insert! ::bird [(bird 81 0 "a") (bird 81 0 "b")])
    (reset! captured [])
    (is (= 2 (t2/delete! ::bird {:where [:= :group_id 81]})))
    (is (=? {:op :delete, :model ::bird} (first (events))))
    (is (= 2 (count (:rows (first (events))))))))

(deftest honeysql-expression-changes-passthrough-test
  (reset-capture!)
  (testing "a honeysql expression in :changes is delivered as-is (pass-through)"
    (t2/insert! ::bird [(bird 90 3 "a") (bird 90 7 "b")])
    (reset! captured [])
    (t2/update! ::bird :group_id 90 {:n [:+ :n 1]})
    (is (= 1 (count (events))))
    (is (= {:n [:+ :n 1]} (:changes (first (events)))))))

(deftest rollback-fires-at-least-once-test
  (reset-capture!)
  (testing "a captured delete in a transaction that then throws still fired its event and left the rows"
    (t2/insert! ::bird [(bird 100 0 "a") (bird 100 0 "b")])
    (reset! captured [])
    (is (thrown? clojure.lang.ExceptionInfo
                 (t2/with-transaction [_conn]
                   (t2/delete! ::bird :group_id 100)
                   (throw (ex-info "boom" {})))))
    (testing "the event fired before the rollback"
      (is (= 1 (count (events))))
      (is (=? {:op :delete} (first (events)))))
    (testing "the rows survive the rollback"
      (is (= 2 (t2/count ::bird :group_id 100))))))

(deftest raw-table-name-bypass-test
  (reset-capture!)
  (testing "DML addressed to the raw table name bypasses capture entirely"
    (t2/insert! ::bird [(bird 110 0 "a") (bird 110 0 "b")])
    (reset! captured [])
    (t2/delete! (t2/table-name ::bird) {:where [:= :group_id 110]})
    (is (empty? (events)))
    (is (= 0 (t2/count ::bird :group_id 110)))))

(deftest default-capture-fields-is-nil-test
  (testing "a model that never registered capture-fields is uncaptured by default"
    (is (nil? (dml-capture/capture-fields ::never-registered :insert)))
    (is (nil? (dml-capture/capture-fields ::never-registered :update)))
    (is (nil? (dml-capture/capture-fields ::never-registered :delete)))))

(deftest composition-after-insert-reentry-test
  (reset-capture!)
  (testing "with an after-insert tool present, per-row after-insert runs and exactly one :insert event fires"
    (is (= 3 (t2/insert! ::moody-bird [(bird 200 0 "a") (bird 200 0 "b") (bird 200 0 "c")])))
    (is (= 3 @after-insert-count))
    (is (= 1 (count (events))))
    (is (=? {:op :insert, :model ::moody-bird} (first (events))))))

(deftest composition-before-update-rewrite-test
  (reset-capture!)
  (testing "an update rewritten by before-update delivers the rewritten :changes"
    (reset! moody-before-update-fn (fn [row] (cond-> row (neg? (:n row 0)) (assoc :n 0))))
    (t2/insert! ::moody-bird [(bird 210 5 "a") (bird 210 5 "b")])
    (reset! captured [])
    (t2/update! ::moody-bird :group_id 210 {:n -1})
    (is (= 1 (count (events))))
    (is (= {:n 0} (:changes (first (events)))))))

(deftest composition-before-update-splits-into-groups-test
  (reset-capture!)
  (testing "a before-update producing per-row changes splits one statement into one event per group"
    (reset! moody-before-update-fn (fn [row] (assoc row :n (+ (:n row) (:id row)))))
    (let [ids (t2/insert-returning-pks! ::moody-bird
                                        [(bird 220 0 "a") (bird 220 0 "b") (bird 220 0 "c")])]
      (reset! captured [])
      (t2/update! ::moody-bird :group_id 220 {:n 100})
      (testing "one event per distinct rewritten change set"
        (is (= (count ids) (count (events))))
        (is (= (set (map (fn [id] {:n (+ 100 id)}) ids))
               (set (map :changes (events)))))
        (testing "each event carries exactly its own group's single pre-image row"
          (is (every? #(= 1 (count (:rows %))) (events))))))))

(deftest composition-delete-no-ambiguity-test
  (reset-capture!)
  (testing "a model mixing before-delete with capture deletes without ambiguity and fires one :delete event"
    (t2/insert! ::moody-bird [(bird 230 0 "a") (bird 230 0 "b")])
    (reset! captured [])
    (is (= 2 (t2/delete! ::moody-bird :group_id 230)))
    (is (= 1 (count (events))))
    (is (=? {:op :delete, :model ::moody-bird} (first (events))))
    (is (= 2 (count (:rows (first (events))))))))

(deftest insert-backfills-missing-capture-fields-test
  (reset-capture!)
  (testing "a capture field absent from the insert literals (db default / before-insert) is back-filled by pk"
    (swap! bird-capture-fields assoc :insert [:id :group_id :n])
    ;; :n is omitted so the database default (0) fills it; the seam must recover it with one extra select.
    (t2/with-call-count [call-count]
      (t2/insert! ::bird {:name "backfill" :group_id 240})
      (is (= 2 (call-count))))
    (is (= 1 (count (events))))
    (let [{:keys [rows pks]} (first (events))]
      (is (= 1 (count rows)))
      (is (= #{:id :group_id :n} (set (keys (first rows)))))
      (is (=? [{:group_id 240, :n 0, :id (first pks)}] rows))))
  (testing "complete literals keep the zip path: no extra select"
    (reset-capture!)
    (swap! bird-capture-fields assoc :insert [:id :group_id :n])
    (t2/with-call-count [call-count]
      (t2/insert! ::bird {:name "no-backfill" :group_id 241 :n 7})
      (is (= 1 (call-count))))
    (is (=? [{:rows [{:group_id 241, :n 7}]}] (events)))))

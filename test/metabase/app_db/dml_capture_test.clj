(ns metabase.app-db.dml-capture-test
  "Pins the statement-level DML capture contract documented in [[metabase.app-db.dml-capture]].
  Not parallel: the suite mutates the global hierarchy and shares one scratch table across tests."
  (:require
   [clojure.test :refer :all]
   [mb.hawk.assert-exprs]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.dml-capture :as dml-capture]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.execute :as t2.execute]
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

;;; `::decorated-bird` carries the decorations capture must bypass. Its after-select dereferences a column a
;;; narrow snapshot doesn't fetch (the shape of :model/Revision's :object deserializer), and its transforms
;;; rewrite :name on the way in and out, so a decorated read is distinguishable from a raw one.
(methodical/defmethod t2.model/table-name ::decorated-bird [_] table-name)

(t2/deftransforms ::decorated-bird
  {:name {:in  (fn [s] (u/upper-case-en ^String s))
          :out (fn [s] (u/lower-case-en ^String s))}})

(t2/define-after-select ::decorated-bird
  [row]
  ;; (inc nil) throws, so this after-select cannot survive a row that didn't fetch :n — a live trap for any
  ;; capture path that runs instance decorations against a narrow snapshot.
  (assoc row :n-plus (inc (:n row))))

(defmethod dml-capture/capture-fields ::decorated-bird
  [_ op]
  ;; Neither op captures :n, keeping the after-select trap armed; :delete includes :name so the raw stored
  ;; value is observable.
  (case op
    :update [:id :group_id]
    :delete [:id :group_id :name]
    nil))

(defmethod dml-capture/captured! ::decorated-bird [_ event] (swap! captured conj event))

(defn- reset-capture! []
  (reset! captured [])
  (reset! bird-capture-fields {:insert [:id :group_id]
                               :update [:id :group_id]
                               :delete [:id :group_id]})
  (reset! moody-before-update-fn identity)
  (reset! after-insert-count 0))

(defn- events [] @captured)

(defn- rows-by-id [rows]
  (into {} (map (juxt :id (fn [row] (into {} row)))) rows))

(defn- is-same-rows-by-pk
  [pks expected actual]
  (is (= (set pks) (set (map :id expected)) (set (map :id actual))))
  (is (= (rows-by-id expected) (rows-by-id actual))))

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
    (derive ::decorated-bird dml-capture/hook)
    (try
      (thunk)
      (finally
        (underive ::bird dml-capture/hook)
        (underive ::moody-bird dml-capture/hook)
        (underive ::decorated-bird dml-capture/hook)
        (t2/query [(drop-table-sql)])))))

(defn- bird [group-id n name-str] {:name name-str, :group_id group-id, :n n})

(deftest insert-multi-row-single-event-test
  (reset-capture!)
  (swap! bird-capture-fields assoc :insert [:id :group_id :n])
  (testing "a multi-row insert returns the count and delivers exactly one :insert event"
    (let [rows [(bird 10 1 "a") (bird 10 2 "b") (bird 10 3 "c")]]
      (is (= 3 (t2/insert! ::bird rows)))
      (is (= 1 (count (events))))
      (let [{:keys [pks] :as event} (first (events))]
        (is (=? {:op :insert, :model ::bird, :pks [pos-int? pos-int? pos-int?]} event))
        (is (= 3 (count (:rows event))))
        (is (every? #(= #{:id :group_id :n} (set (keys %))) (:rows event)))
        (testing "returned PKs and event rows are the same exact persisted row set, matched by PK"
          (is-same-rows-by-pk pks
                              (t2/select [::bird :id :group_id :n] :id [:in pks])
                              (:rows event)))))))

(deftest insert-adds-no-queries-test
  (reset-capture!)
  (testing "capturing a single-row insert runs exactly one SQL statement"
    (t2/with-call-count [call-count]
      (is (= 1 (t2/insert! ::bird (bird 20 0 "x"))))
      (is (= 1 (call-count))))
    (is (= 1 (count (events)))))
  (testing "a PK-only multi-row capture also runs exactly one SQL statement"
    (reset-capture!)
    (swap! bird-capture-fields assoc :insert [:id])
    (t2/with-call-count [call-count]
      (is (= 3 (t2/insert! ::bird [(bird 21 0 "a") (bird 21 0 "b") (bird 21 0 "c")])))
      (is (= 1 (call-count))))
    (let [{:keys [pks rows]} (first (events))]
      (is (= (set pks) (set (map :id rows))))
      (is (every? #(= #{:id} (set (keys %))) rows))))
  (testing "complete rows with explicit PKs need no backfill and are matched by PK, not order"
    (reset-capture!)
    (swap! bird-capture-fields assoc :insert [:id :group_id :n])
    (let [rows [{:id 22001, :name "explicit-a", :group_id 22, :n 1}
                {:id 22002, :name "explicit-b", :group_id 23, :n 2}]]
      (t2/with-call-count [call-count]
        (is (= 2 (t2/insert! ::bird rows)))
        (is (= 1 (call-count))))
      (is-same-rows-by-pk [22002 22001]
                          (mapv #(select-keys % [:id :group_id :n]) (reverse rows))
                          (:rows (first (events)))))))

(deftest insert-returning-pks-passthrough-test
  (reset-capture!)
  (testing "insert-returning-pks! returns the pks unchanged and fires one event with pk'd row literals"
    (let [pks (t2/insert-returning-pks! ::bird [(bird 30 0 "a") (bird 30 0 "b")])]
      (is (= 2 (count pks)))
      (is (= 1 (count (events))))
      (let [{event-pks :pks, rows :rows} (first (events))]
        (is (= pks event-pks))
        (is-same-rows-by-pk pks
                            (t2/select [::bird :id :group_id] :id [:in pks])
                            rows)))))

(deftest insert-returning-instances-passthrough-test
  (reset-capture!)
  (testing "insert-returning-instances! returns the instances unchanged and fires one event, not two"
    (let [instances (t2/insert-returning-instances! ::bird [(bird 31 0 "a") (bird 31 0 "b")])]
      (is (= 2 (count instances)))
      (is (= #{"a" "b"} (set (map :name instances))))
      (is (= 1 (count (events))))
      (testing "the event and returned instances identify the same rows without assuming result order"
        (let [{:keys [pks rows]} (first (events))]
          (is (= (set (map :id instances)) (set pks) (set (map :id rows))))
          (is (= #{31} (set (map :group_id rows)))))))))

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

(deftest pre-image-sql-error-propagates-test
  (reset-capture!)
  (let [id (t2/insert-returning-pk! ::bird (bird 71 0 "sql-error"))]
    (reset! captured [])
    (testing "an executed snapshot query failure is not suppressed inside the caller's transaction"
      (with-redefs [t2.execute/query (fn [_sql-args]
                                       (throw (java.sql.SQLException. "snapshot failed")))]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"snapshot failed"
                              (t2/update! ::bird id {:n 1})))))
    (is (= 0 (t2/select-one-fn :n ::bird id)))
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
    (let [pks (t2/insert-returning-pks! ::bird [(bird 81 0 "a") (bird 81 0 "b")])]
      (reset! captured [])
      (is (= 2 (t2/delete! ::bird {:where [:= :group_id 81]})))
      (is (=? {:op :delete, :model ::bird} (first (events))))
      (is (= (set (map (fn [pk] {:id pk, :group_id 81}) pks))
             (set (:rows (first (events)))))))))

(deftest honeysql-expression-changes-passthrough-test
  (reset-capture!)
  (testing "a honeysql expression in :changes is delivered as-is (pass-through), with the usual pre-image rows"
    (let [pks (t2/insert-returning-pks! ::bird [(bird 90 3 "a") (bird 90 7 "b")])]
      (reset! captured [])
      (t2/update! ::bird :group_id 90 {:n [:+ :n 1]})
      (is (= 1 (count (events))))
      (is (= {:n [:+ :n 1]} (:changes (first (events)))))
      (is (= (set (map (fn [pk] {:id pk, :group_id 90}) pks))
             (set (:rows (first (events)))))))))

(deftest rollback-fires-at-least-once-test
  (reset-capture!)
  (testing "a captured delete in a transaction that then throws still fired its event and left the rows"
    (t2/insert! ::bird [(bird 100 0 "a") (bird 100 0 "b")])
    (reset! captured [])
    (is (thrown? clojure.lang.ExceptionInfo
                 (t2/with-transaction [_conn]
                   (t2/delete! ::bird :group_id 100)
                   (throw (ex-info "boom" {})))))
    (testing "the event fired before the rollback, carrying the (still-live) pre-image rows"
      (is (= 1 (count (events))))
      (is (=? {:op :delete, :model ::bird, :rows [{:group_id 100} {:group_id 100}]} (first (events)))))
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
    (testing "the re-dispatched (instances-upgraded) path captures the exact returned PK set"
      (let [{:keys [pks] :as event} (first (events))]
        (is (=? {:op    :insert
                 :model ::moody-bird
                 :rows  [{:id pos-int?, :group_id 200}
                         {:id pos-int?, :group_id 200}
                         {:id pos-int?, :group_id 200}]
                 :pks   [pos-int? pos-int? pos-int?]}
                event))
        (is (= (set pks) (set (map :id (:rows event)))))))))

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
        (testing "each event pairs its group's changes with that group's own pre-image row, not another's"
          (is (every? #(= 1 (count (:rows %))) (events)))
          (doseq [{:keys [changes rows]} (events)]
            (is (= (:n changes) (+ 100 (:id (first rows)))))))))))

(deftest composition-delete-no-ambiguity-test
  (reset-capture!)
  (testing "a model mixing before-delete with capture deletes without ambiguity and fires one :delete event"
    (let [pks (t2/insert-returning-pks! ::moody-bird [(bird 230 0 "a") (bird 230 0 "b")])]
      (reset! captured [])
      (is (= 2 (t2/delete! ::moody-bird :group_id 230)))
      (is (= 1 (count (events))))
      (is (=? {:op :delete, :model ::moody-bird} (first (events))))
      (is (= (set (map (fn [pk] {:id pk, :group_id 230}) pks))
             (set (:rows (first (events)))))))))

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
  (testing "multiple rows are back-filled and correlated by PK, not input/result position"
    (reset-capture!)
    (swap! bird-capture-fields assoc :insert [:id :group_id :n])
    (let [pks (t2/insert-returning-pks! ::bird [{:name "multi-a", :group_id 242}
                                                {:name "multi-b", :group_id 243}])
          {event-pks :pks, rows :rows} (first (events))
          persisted (t2/select [::bird :id :group_id :n] :id [:in pks])]
      (is (= pks event-pks))
      (is-same-rows-by-pk pks persisted rows)))
  (testing "an explicit PK does not bypass backfill when a captured value is a SQL expression"
    (reset-capture!)
    (swap! bird-capture-fields assoc :insert [:id :group_id :n])
    (t2/with-call-count [call-count]
      (t2/insert! ::bird {:id 24001, :name "expression", :group_id 244, :n [:+ 1 2]})
      (is (= 2 (call-count))))
    (is (= [{:id 24001, :group_id 244, :n 3}]
           (:rows (first (events))))))
  (testing "a failed insert backfill rolls the insert back"
    (reset-capture!)
    (swap! bird-capture-fields assoc :insert [:id :group_id :n])
    (with-redefs [t2.execute/query (fn [_sql-args]
                                     (throw (java.sql.SQLException. "backfill failed")))]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"backfill failed"
                            (t2/insert! ::bird {:id 24002, :name "rollback", :group_id 244, :n [:+ 1 2]}))))
    (is (false? (t2/exists? ::bird :id 24002)))
    (is (empty? (events))))
  (testing "complete literals keep the zip path: no extra select"
    (reset-capture!)
    (swap! bird-capture-fields assoc :insert [:id :group_id :n])
    (t2/with-call-count [call-count]
      (t2/insert! ::bird {:name "no-backfill" :group_id 241 :n 7})
      (is (= 1 (call-count))))
    (is (=? [{:rows [{:group_id 241, :n 7}]}] (events)))))

(deftest capture-bypasses-instance-decorations-test
  (reset-capture!)
  (testing "capture selects run modelless: no after-select decoration, no out-transforms"
    (t2/insert! ::decorated-bird {:name "abc" :group_id 250})
    (testing "an after-select that dereferences an unfetched column would throw if decorations ran"
      (reset! captured [])
      (is (= 1 (t2/update! ::decorated-bird :group_id 250 {:n 1})))
      (is (=? [{:op :update, :rows [{:group_id 250}]}] (events)))
      (is (= #{:id :group_id} (set (keys (first (:rows (first (events)))))))))
    (testing "captured values are the raw stored column values: in-transformed on write, never out-transformed"
      (reset! captured [])
      (is (= 1 (t2/delete! ::decorated-bird :group_id 250)))
      (let [[{:keys [rows]} :as evs] (events)]
        (is (= 1 (count evs)))
        (is (=? [{:group_id 250, :name "ABC"}] rows))
        (testing "no decoration keys leak into the snapshot"
          (is (= #{:id :group_id :name} (set (keys (first rows))))))))))

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
;;; registers toucan2's row-level delete tool, so composition tests keep `::bird`'s preconditions obvious.
(methodical/defmethod t2.model/table-name ::bird [_] table-name)
(methodical/defmethod t2.model/table-name ::moody-bird [_] table-name)

(def ^:private captured
  "Events delivered by [[dml-capture/captured!]] for the scratch models, in order."
  (atom []))

(def ^:private bird-capture-fields
  "`capture-fields` for `::bird`, so a test can switch capture off without redefining a method."
  (atom {:delete [:id :group_id]}))

(defmethod dml-capture/capture-fields ::bird [_ op] (get @bird-capture-fields op))
(defmethod dml-capture/capture-fields ::moody-bird [_ _op] [:id :group_id])

(defmethod dml-capture/captured! ::bird [_ event] (swap! captured conj event))
(defmethod dml-capture/captured! ::moody-bird [_ event] (swap! captured conj event))

(t2/define-before-delete ::moody-bird [row] row)

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
  ;; Capture never asks for :n, keeping the after-select trap armed; :name is captured so the raw stored value
  ;; is observable.
  (when (= op :delete)
    [:id :group_id :name]))

(defmethod dml-capture/captured! ::decorated-bird [_ event] (swap! captured conj event))

(defn- reset-capture! []
  (reset! captured [])
  (reset! bird-capture-fields {:delete [:id :group_id]}))

(defn- events [] @captured)

;; Identifiers stay unquoted so each database folds them to its own natural case, which is the case Metabase's
;; HoneySQL dialect then generates for this model. Quoting them lowercase creates a table H2 cannot find.
(defn- create-table-sql []
  (str "CREATE TABLE " table-name
       (case (mdb/db-type)
         :postgres      " (id SERIAL PRIMARY KEY,"
         (:h2 :mysql)   " (id BIGINT AUTO_INCREMENT PRIMARY KEY,")
       " name VARCHAR(255) NOT NULL, group_id INT NOT NULL, n INT NOT NULL DEFAULT 0)"))

(defn- drop-table-sql []
  (str "DROP TABLE IF EXISTS " table-name))

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

(deftest delete-statement-counts-test
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
  (testing "a delete matching zero rows delivers no event"
    (reset-capture!)
    (is (= 0 (t2/delete! ::bird :group_id 61)))
    (is (empty? (events)))))

(deftest wide-delete-skips-capture-test
  (reset-capture!)
  (testing "a statement matching more rows than the ceiling deletes the rows but delivers no event"
    (t2/insert! ::bird [(bird 62 0 "a") (bird 62 0 "b") (bird 62 0 "c")])
    (reset! captured [])
    ;; A value var, not a function: with-dynamic-fn-redefs has nothing to intercept.
    (with-redefs [dml-capture/max-pre-image-rows 2]
      (is (= 3 (t2/delete! ::bird :group_id 62))))
    (is (empty? (events)))
    (is (= 0 (t2/count ::bird :group_id 62))))
  (testing "a statement matching exactly the ceiling is still captured"
    (reset-capture!)
    (t2/insert! ::bird [(bird 63 0 "a") (bird 63 0 "b")])
    (reset! captured [])
    (with-redefs [dml-capture/max-pre-image-rows 2]
      (is (= 2 (t2/delete! ::bird :group_id 63))))
    (is (= 1 (count (events))))
    (is (= 2 (count (:rows (first (events))))))))

(deftest pre-image-sql-error-propagates-test
  (reset-capture!)
  (let [id (t2/insert-returning-pk! ::bird (bird 71 0 "sql-error"))]
    (reset! captured [])
    (testing "an executed snapshot query failure is not suppressed inside the caller's transaction"
      (with-redefs [t2.execute/reducible-query (fn [_sql-args]
                                                 (throw (java.sql.SQLException. "snapshot failed")))]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"snapshot failed"
                              (t2/delete! ::bird id)))))
    (testing "the statement never ran"
      (is (true? (t2/exists? ::bird id))))
    (is (empty? (events)))
    (t2/delete! ::bird id)))

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

(deftest uncaptured-ops-fire-nothing-test
  (reset-capture!)
  (testing "inserts and updates are out of scope for this seam and deliver no events"
    (let [pks (t2/insert-returning-pks! ::bird [(bird 120 0 "a") (bird 120 0 "b")])]
      (is (empty? (events)))
      (is (= 2 (t2/update! ::bird :group_id 120 {:n 1})))
      (is (empty? (events)))
      (testing "a delete against the same rows still is"
        (is (= 2 (t2/delete! ::bird :id [:in pks])))
        (is (= 1 (count (events))))
        (is (=? {:op :delete} (first (events))))))))

(deftest default-capture-fields-is-nil-test
  (testing "a model that never registered capture-fields is uncaptured by default"
    (is (nil? (dml-capture/capture-fields ::never-registered :delete)))))

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

(deftest capture-bypasses-instance-decorations-test
  (reset-capture!)
  (testing "capture selects run modelless: no after-select decoration, no out-transforms"
    (t2/insert! ::decorated-bird {:name "abc" :group_id 250})
    (reset! captured [])
    ;; The snapshot omits :n, so an after-select that dereferences it would throw if decorations ran.
    (is (= 1 (t2/delete! ::decorated-bird :group_id 250)))
    (let [[{:keys [rows]} :as evs] (events)]
      (is (= 1 (count evs)))
      (testing "captured values are the raw stored column values: in-transformed on write, never out-transformed"
        (is (=? [{:group_id 250, :name "ABC"}] rows)))
      (testing "no decoration keys leak into the snapshot"
        (is (= #{:id :group_id :name} (set (keys (first rows)))))))))

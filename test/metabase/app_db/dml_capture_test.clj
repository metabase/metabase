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
   [toucan2.model :as t2.model]
   [toucan2.pipeline :as t2.pipeline]))

(set! *warn-on-reflection* true)

(def ^:private table-name "dml_capture_test_bird")

;;; `::bird` is a clean model carrying only capture. `::moody-bird` shares the same table but additionally
;;; registers toucan2's row-level delete tool, so composition tests keep `::bird`'s preconditions obvious.
(methodical/defmethod t2.model/table-name ::bird [_] table-name)
(methodical/defmethod t2.model/table-name ::moody-bird [_] table-name)
;; A `table-name` method registers the keyword as a toucan2 model for the life of the JVM, so this derivation
;; has to be just as permanent: metabase.models-test/toucan2-models-should-derive-test scans every registered
;; model and asserts this for each, whenever it runs later in the same test process.
(derive ::bird :metabase/model)
(derive ::moody-bird :metabase/model)

(def ^:private captured
  "Events delivered by [[dml-capture/captured!]] for the scratch models, in order."
  (atom []))

(def ^:private bird-capture-fields
  "Values of `capture-fields` for `::bird`, so a test can switch capture off without redefining a method."
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
(derive ::decorated-bird :metabase/model)

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

;; Inserts and updates are never captured (see `uncaptured-ops-fire-nothing-test`), so a test resets once and
;; may insert its fixture rows afterwards.
(defn- reset-capture! []
  (reset! captured [])
  (reset! bird-capture-fields {:delete [:id :group_id]}))

(defn- events [] @captured)

(defn- rows-for
  "The pre-image rows `::bird` captures for `pks` in `group-id`, as a set."
  [pks group-id]
  (set (map (fn [pk] {:id pk, :group_id group-id}) pks)))

(defn- captured-rows
  "The rows of the only event delivered, as a set."
  []
  (let [[event & more] (events)]
    (assert (empty? more) "expected exactly one event")
    (set (:rows event))))

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

(defn- bird [group-id name-str] {:name name-str, :group_id group-id})

(deftest delete-by-pk-and-by-honeysql-test
  (testing "delete by :id captures the pre-image rows"
    (reset-capture!)
    (let [id (first (t2/insert-returning-pks! ::bird (bird 80 "a")))]
      (is (= 1 (t2/delete! ::bird :id id)))
      (is (=? [{:op :delete, :model ::bird, :rows [{:id id, :group_id 80}]}] (events)))))
  (testing "delete by a bare pk captures the pre-image rows"
    (reset-capture!)
    (let [id (t2/insert-returning-pk! ::bird (bird 84 "a"))]
      ;; The bare pk is the shape under test. The linter steers production code away from it, but toucan2 accepts
      ;; it, and `apply` keeps the call out of the linter's sight.
      (is (= 1 (apply t2/delete! ::bird [id])))
      (is (=? [{:op :delete, :model ::bird, :rows [{:id id, :group_id 84}]}] (events)))))
  (testing "delete with a honeysql where-map captures the pre-image rows"
    (reset-capture!)
    (let [pks (t2/insert-returning-pks! ::bird [(bird 81 "a") (bird 81 "b")])]
      (is (= 2 (t2/delete! ::bird {:where [:= :group_id 81]})))
      (is (=? [{:op :delete, :model ::bird}] (events)))
      (is (= (rows-for pks 81) (captured-rows))))))

(deftest explicit-honeysql-delete-syntax-test
  (testing "an explicit :delete-from map is restated as a select, so the snapshot compiles and the delete runs"
    (reset-capture!)
    (let [pks (t2/insert-returning-pks! ::bird [(bird 82 "a") (bird 82 "b")])]
      (is (= 2 (t2/delete! ::bird {:delete-from (keyword table-name), :where [:= :group_id 82]})))
      ;; The `{:delete [], :from [...]}` spelling has no case here: Funny SQL cannot compile a top-level `:delete`,
      ;; so such a delete throws and nothing is captured.
      (is (= (rows-for pks 82) (captured-rows))))))

(deftest delete-statement-counts-test
  (testing "a captured delete runs two statements (narrow select + delete)"
    (reset-capture!)
    (t2/insert! ::bird [(bird 51 "a") (bird 51 "b")])
    (t2/with-call-count [call-count]
      (t2/delete! ::bird :group_id 51)
      (is (= 2 (call-count)))))
  (testing "a delete whose capture-fields returns nil runs one statement and fires nothing"
    (reset-capture!)
    (swap! bird-capture-fields assoc :delete nil)
    (t2/insert! ::bird [(bird 52 "a") (bird 52 "b")])
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
  (testing "a statement matching more rows than the ceiling deletes the rows but delivers no event"
    (reset-capture!)
    (t2/insert! ::bird [(bird 62 "a") (bird 62 "b") (bird 62 "c")])
    ;; A value var, not a function: with-dynamic-fn-redefs has nothing to intercept.
    (with-redefs [dml-capture/max-pre-image-rows 2]
      (is (= 3 (t2/delete! ::bird :group_id 62))))
    (is (empty? (events)))
    (is (= 0 (t2/count ::bird :group_id 62))))
  (testing "a statement matching exactly the ceiling is still captured"
    (reset-capture!)
    (t2/insert! ::bird [(bird 63 "a") (bird 63 "b")])
    (with-redefs [dml-capture/max-pre-image-rows 2]
      (is (= 2 (t2/delete! ::bird :group_id 63))))
    (is (=? [{:rows [{:group_id 63} {:group_id 63}]}] (events))))
  (testing "the snapshot asks the database for at most one row past the ceiling"
    (reset-capture!)
    (t2/insert! ::bird (bird 64 "a"))
    (let [queries         (atom [])
          reducible-query t2.execute/reducible-query]
      (with-redefs [dml-capture/max-pre-image-rows 2
                    t2.execute/reducible-query     (fn [sql-args]
                                                     (swap! queries conj sql-args)
                                                     (reducible-query sql-args))]
        (is (= 1 (t2/delete! ::bird :group_id 64))))
      (is (=? [[#"(?is).*\bLIMIT 3\b.*"]] @queries)))))

(deftest query-inspection-runs-nothing-test
  (testing "compiling a captured delete returns the DELETE without running the snapshot or delivering an event"
    (reset-capture!)
    (let [id (t2/insert-returning-pk! ::bird (bird 65 "a"))]
      (is (=? [(re-pattern (str "(?is)\\s*DELETE\\b.*\\b" id))] (t2/compile (t2/delete! ::bird :id id))))
      (is (empty? (events)))
      (is (true? (t2/exists? ::bird :id id))))))

(deftest pre-image-build-failure-skips-capture-test
  (testing "a snapshot query that fails to build skips capture, and the delete still runs"
    (reset-capture!)
    (let [id    (t2/insert-returning-pk! ::bird (bird 72 "build-error"))
          build t2.pipeline/build]
      ;; `build` is a multimethod, which with-dynamic-fn-redefs refuses; only the snapshot's select is broken.
      (with-redefs [t2.pipeline/build (fn [query-type & more]
                                        (if (= query-type :toucan.query-type/select.instances)
                                          (throw (ex-info "cannot build" {}))
                                          (apply build query-type more)))]
        (is (= 1 (t2/delete! ::bird :id id))))
      (is (empty? (events)))
      (is (false? (t2/exists? ::bird :id id))))))

(deftest pre-image-sql-error-propagates-test
  (reset-capture!)
  (let [id (t2/insert-returning-pk! ::bird (bird 71 "sql-error"))]
    (testing "an executed snapshot query failure is not suppressed inside the caller's transaction"
      (with-redefs [t2.execute/reducible-query (fn [_sql-args]
                                                 (throw (java.sql.SQLException. "snapshot failed")))]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"snapshot failed"
                              (t2/delete! ::bird :id id)))))
    (testing "the statement never ran"
      (is (true? (t2/exists? ::bird :id id))))
    (is (empty? (events)))
    (t2/delete! ::bird :id id)))

(deftest consumer-failure-does-not-fail-the-delete-test
  (testing "an exception from captured! is logged, and the delete it reports on still succeeds"
    (reset-capture!)
    (let [id (t2/insert-returning-pk! ::bird (bird 73 "consumer-error"))]
      ;; `captured!` is a multimethod, which with-dynamic-fn-redefs refuses.
      (with-redefs [dml-capture/captured! (fn [_model _event] (throw (ex-info "consumer failed" {})))]
        (is (= 1 (t2/delete! ::bird :id id))))
      (is (false? (t2/exists? ::bird :id id))))))

(deftest consumer-interrupt-test
  ;; `captured!` is a multimethod, which with-dynamic-fn-redefs refuses.
  (with-redefs [dml-capture/captured! (fn [_model _event] (throw (InterruptedException. "consumer interrupted")))]
    (testing "an interrupt from captured! is logged, and the thread's interrupt status is restored"
      (#'dml-capture/deliver-captured! ::bird {:op :delete, :model ::bird, :rows []})
      ;; Also clears the status again, so later tests run on a thread that is not interrupted.
      (is (true? (Thread/interrupted))))
    (testing "the delete it reports on still succeeds"
      (reset-capture!)
      (let [id (t2/insert-returning-pk! ::bird (bird 74 "consumer-interrupt"))]
        (is (= 1 (t2/delete! ::bird :id id)))
        (Thread/interrupted)
        (is (false? (t2/exists? ::bird :id id)))))))

(deftest rollback-fires-at-least-once-test
  (reset-capture!)
  (testing "a captured delete in a transaction that then throws still fired its event and left the rows"
    (t2/insert! ::bird [(bird 100 "a") (bird 100 "b")])
    (is (thrown? clojure.lang.ExceptionInfo
                 (t2/with-transaction [_conn]
                   (t2/delete! ::bird :group_id 100)
                   (throw (ex-info "boom" {})))))
    (testing "the event fired before the rollback, carrying the (still-live) pre-image rows"
      (is (=? [{:op :delete, :model ::bird, :rows [{:group_id 100} {:group_id 100}]}] (events))))
    (testing "the rows survive the rollback"
      (is (= 2 (t2/count ::bird :group_id 100))))))

(deftest raw-table-name-bypass-test
  (reset-capture!)
  (testing "DML addressed to the raw table name bypasses capture entirely"
    (t2/insert! ::bird [(bird 110 "a") (bird 110 "b")])
    (t2/delete! (t2/table-name ::bird) {:where [:= :group_id 110]})
    (is (empty? (events)))
    (is (= 0 (t2/count ::bird :group_id 110)))))

(deftest unsupported-delete-snapshots-skip-capture-test
  (testing "SQL-args deletes run once without being reused as a pre-image query"
    (reset-capture!)
    (t2/insert! ::bird [(bird 111 "a") (bird 111 "b")])
    (is (= 2 (t2/delete! ::bird [(str "DELETE FROM " table-name " WHERE group_id = ?") 111])))
    (is (empty? (events)))
    (is (= 0 (t2/count ::bird :group_id 111))))
  (testing "a raw SQL string delete runs once, and reports the rows it deleted"
    (reset-capture!)
    (t2/insert! ::bird [(bird 113 "a") (bird 113 "b")])
    (is (= 2 (t2/delete! ::bird "DELETE FROM dml_capture_test_bird WHERE group_id = 113")))
    (is (empty? (events))))
  (testing "query shapes a separate SELECT cannot restate are rejected before the capture pipeline builds them"
    (let [build-calls (atom 0)]
      (with-redefs [t2.pipeline/build (fn [& _] (swap! build-calls inc))]
        (are [query] (nil? (#'dml-capture/pre-image-rows
                            :toucan.query-type/select.instances ::bird [:id] {} query))
          ;; DELETE ... USING
          {:delete-from (keyword table-name), :using [:other_table], :where [:= :group_id 112]}
          ;; a CTE, which the snapshot would run a second time
          {:with  [[:doomed {:select [:id], :from [(keyword table-name)]}]]
           :where [:in :id {:select [:id], :from [:doomed]}]}
          ;; a recursive CTE, likewise
          {:with-recursive [[:doomed {:select [:id], :from [(keyword table-name)]}]]
           :where          [:in :id {:select [:id], :from [:doomed]}]}
          ;; a LIMIT, which picks arbitrary rows without an ORDER BY
          {:where [:= :group_id 112], :limit 1}
          ;; a RETURNING clause, which a SELECT cannot carry
          {:where [:= :group_id 112], :returning [:id]}
          ;; a raw SQL string
          (str "DELETE FROM " table-name " WHERE group_id = 112"))
        (is (zero? @build-calls))))))

(deftest uncaptured-ops-fire-nothing-test
  (reset-capture!)
  (testing "inserts and updates are out of scope for this seam and deliver no events"
    (let [pks (t2/insert-returning-pks! ::bird [(bird 120 "a") (bird 120 "b")])]
      (is (empty? (events)))
      (is (= 2 (t2/update! ::bird :group_id 120 {:n 1})))
      (is (empty? (events)))
      (testing "a delete against the same rows still is"
        (is (= 2 (t2/delete! ::bird :id [:in pks])))
        (is (=? [{:op :delete}] (events)))))))

(deftest default-capture-fields-is-nil-test
  (testing "a model that never registered capture-fields is uncaptured by default"
    (is (nil? (dml-capture/capture-fields ::never-registered :delete)))))

(deftest composition-delete-no-ambiguity-test
  (reset-capture!)
  (testing "a model mixing before-delete with capture deletes without ambiguity and fires one :delete event"
    (let [pks (t2/insert-returning-pks! ::moody-bird [(bird 230 "a") (bird 230 "b")])]
      (is (= 2 (t2/delete! ::moody-bird :group_id 230)))
      (is (=? [{:op :delete, :model ::moody-bird}] (events)))
      (is (= (rows-for pks 230) (captured-rows))))))

(deftest capture-bypasses-instance-decorations-test
  (reset-capture!)
  (testing "capture selects run modelless: no after-select decoration, no out-transforms"
    (t2/insert! ::decorated-bird {:name "abc", :group_id 250})
    ;; The snapshot omits :n, so an after-select that dereferences it would throw if decorations ran.
    (is (= 1 (t2/delete! ::decorated-bird :group_id 250)))
    (testing "captured values are the raw stored column values: in-transformed on write, never out-transformed"
      (is (=? [{:rows [{:group_id 250, :name "ABC"}]}] (events))))
    (let [rows (captured-rows)]
      (testing "rows are plain maps, not toucan2 instances"
        (is (not-any? t2/instance? rows)))
      (testing "no decoration keys leak into the snapshot"
        (is (= #{:id :group_id :name} (set (mapcat keys rows))))))))

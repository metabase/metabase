(ns metabase.task-history.models.task-history-queries-test
  "Checks for the HugSQL app-db POC.

  1. [[raw-splice-lint-test]] -- the lint rule: no raw-splice params (`:sql:`/`:snip:`) in any
     `.sql` file under `src/`, except allowlisted params that are fed exclusively from a closed
     map of dev-authored literals. [[order-by-fragments-shape-test]] verifies those literals look
     like column/direction lists, not arbitrary SQL.

  2. [[honeysql-equivalence-test]] -- golden test: the HugSQL queries return exactly what the
     previous HoneySQL implementations returned, across the full sort/filter/paging matrix. CI
     runs this against every app-db (H2, MySQL, Postgres); per-dialect equality to the same
     golden implementation implies the dialects also agree with each other."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [dev.raw-splice :as raw-splice]
   [hugsql.core :as hugsql]
   [java-time.api :as t]
   [metabase.task-history.models.task-history :as task-history]
   [metabase.task-history.models.task-history-queries :as queries]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;;; 1. Lint: the raw-splice surface of SQL-in-files
;;;;
;;;; Logic + allowlist are shared with the fast pre-CI check `./bin/mage lint-raw-splices`;
;;;; see [[dev.raw-splice]] and mage/resources/raw-splice-allowlist.edn.

(deftest raw-splice-lint-test
  (is (= [] (vec (raw-splice/violations)))
      "Raw-splice params (:sql:/:snip:) in .sql files must match the allowlist exactly."))

(deftest hostile-sort-params-test
  (testing "hostile sort values are inert: they ride as bound params, match no CASE line, and
            ordering falls through to the id DESC tie-break"
    (let [sqlvec (queries/sqlvec :list-tasks {:task nil, :status nil
                                              :sort-col "1); insert into x values (1); --"
                                              :sort-dir "asc"
                                              :limit 10, :offset 0})]
      (is (not (str/includes? (first sqlvec) "insert into x")))
      (is (some #{"1); insert into x values (1); --"} (rest sqlvec))))))

(deftest raw-splice-params-disarmed-test
  (testing "raw-splice param types are disarmed process-wide: building a query with one throws"
    (doseq [sql ["SELECT * FROM x ORDER BY :sql:o"
                 "SELECT * FROM x WHERE :snip:cond"
                 "SELECT :i:col FROM x"
                 "SELECT :i*:cols FROM x"]]
      (testing sql
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"not allowed"
                              (hugsql/sqlvec sql {:o "id", :cond ["1=1"], :col "id", :cols ["id"]})))))))

;;;; 2. Golden equivalence with the previous HoneySQL implementation

;; The functions below are the pre-HugSQL implementations, copied verbatim. Both implementations
;; run against the same live app-db data, so equality here means the conversion preserved
;; behavior -- including ordering, paging, filters, and NULL semantics -- on this dialect.
;;
;; SCAFFOLDING: this golden section is conversion-time proof, not a permanent fixture. Delete it
;; (goldens + equivalence test) one release after the conversion ships; the lint, disarm, and
;; hostile-input tests above stay.

(defn- old-params->where
  [{:keys [status task]}]
  (when (or status task)
    {:where (cond-> [:and]
              task   (conj [:= :task_history.task task])
              status (conj [:= :task_history.status (name status)]))}))

(def ^:private old-join-sort-columns
  {:db_name   :metabase_database.name
   :db_engine :metabase_database.engine})

(defn- old-params->order-by
  [{col :sort_column
    dir :sort_direction}]
  (if-let [order-col (old-join-sort-columns col)]
    {:select    [:task_history.*]
     :left-join [:metabase_database [:= :task_history.db_id :metabase_database.id]]
     :order-by  [[order-col dir] [:task_history.id :desc]]}
    {:order-by [[col dir] [:id :desc]]}))

(defn- old-all [limit offset params]
  (t2/select :model/TaskHistory (merge (old-params->where params)
                                       (old-params->order-by params)
                                       (when limit
                                         {:limit limit})
                                       (when offset
                                         {:offset offset}))))

(defn- old-total [params]
  (t2/count :model/TaskHistory ((fnil identity {}) (old-params->where params))))

(defn- old-unique-tasks []
  (vec (t2/select-fn-vec :task [:model/TaskHistory :task] {:group-by [:task]
                                                           :order-by [:task]})))

(deftest honeysql-equivalence-test
  (let [task-a (mt/random-name)
        task-b (mt/random-name)
        now    (t/zoned-date-time)
        at     #(t/plus now (t/seconds %))]
    (mt/with-temp [:model/Database    db-1 {:name "hugsql-poc-db-a", :engine :h2}
                   :model/Database    db-2 {:name "hugsql-poc-db-b", :engine :postgres}
                   :model/TaskHistory _ {:task task-a, :status :success, :db_id (:id db-1)
                                         :started_at (at 0), :ended_at (at 1), :duration 1000
                                         :task_details {:x 1}}
                   :model/TaskHistory _ {:task task-a, :status :failed, :db_id (:id db-2)
                                         :started_at (at 2), :ended_at (at 3), :duration 1000}
                   :model/TaskHistory _ {:task task-b, :status :success, :db_id nil
                                         :started_at (at 2), :ended_at (at 5), :duration 3000}
                   :model/TaskHistory _ {:task task-b, :status :started, :db_id (:id db-1)
                                         :started_at (at 6), :ended_at nil, :duration nil}
                   :model/TaskHistory _ {:task task-b, :status :unknown, :db_id (:id db-2)
                                         :started_at (at 7), :ended_at (at 8), :duration 1000}]
      (testing "sort x direction x filter matrix returns identical rows in identical order"
        (doseq [col    (sort @#'task-history/available-sort-columns)
                dir    [:asc :desc]
                filters [{} {:task task-a} {:status :success} {:task task-b, :status :started}]]
          (let [params (merge filters {:sort_column col, :sort_direction dir})]
            (testing (pr-str params)
              (is (= (mapv :id (old-all nil nil params))
                     (mapv :id (task-history/all nil nil params))))))))
      (testing "paging"
        (let [params {:sort_column :started_at, :sort_direction :desc}]
          (doseq [[limit offset] [[2 0] [2 2] [1000 0] [3 nil] [nil nil]]]
            (testing (pr-str [limit offset])
              (is (= (mapv :id (old-all limit offset params))
                     (mapv :id (task-history/all limit offset params))))))))
      (testing "full row equality, including out-transforms (status keyword, task_details map)"
        (is (= (old-all nil nil {:task task-a, :sort_column :started_at, :sort_direction :asc})
               (task-history/all nil nil {:task task-a, :sort_column :started_at, :sort_direction :asc}))))
      (testing "total"
        (doseq [filters [{} {:task task-a} {:status :success} {:task task-b, :status :started}]]
          (testing (pr-str filters)
            (is (= (old-total filters)
                   (task-history/total filters))))))
      (testing "unique-tasks"
        (is (= (old-unique-tasks)
               (task-history/unique-tasks)))))))

(deftest with-task-history-roundtrip-test
  (testing "raw-SQL insert + update round-trip: in-transforms applied, out-transforms restore types"
    (let [task-name (mt/random-name)]
      (task-history/with-task-history {:task task-name, :task_details {:foo "bar"}}
        42)
      (let [th (t2/select-one :model/TaskHistory :task task-name)]
        (is (=? {:status       :success
                 :task_details {:foo "bar"}
                 :duration     int?}
                th))
        (is (some? (:ended_at th)))
        (is (vector? (:logs th)))))))

(deftest with-task-history-failure-roundtrip-test
  (testing "failure path writes :failed with exception details through the raw-SQL update"
    (let [task-name (mt/random-name)]
      (is (thrown-with-msg? Exception #"boom"
                            (task-history/with-task-history {:task task-name}
                              (throw (ex-info "boom" {})))))
      (let [th (t2/select-one :model/TaskHistory :task task-name)]
        (is (=? {:status       :failed
                 :task_details {:message "boom"}}
                th))))))

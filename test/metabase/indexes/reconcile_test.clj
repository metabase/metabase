(ns metabase.indexes.reconcile-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver]
   [metabase.indexes.reconcile :as reconcile]))

(def ^:private managed-btree
  {:id 1 :transform_id 7 :index_name "by_cat"
   :structured {:kind :btree :name "by_cat" :columns [{:name "name"}] :unique true}
   :status :pending :error_message nil :created_by 3 :last_executed_at nil})

(def ^:private managed-sortkey
  {:id 2 :transform_id 7 :index_name "sortkey"
   :structured {:kind :sortkey :style :compound :columns [{:name "a"} {:name "b"}]}
   :status :pending :error_message nil :created_by 3 :last_executed_at nil})

(def ^:private wh-btree
  {:name "by_cat" :kind :btree :access-method "btree" :is-unique true :is-primary false
   :is-valid true :key-columns ["name"] :include-columns [] :partial-predicate nil :definition "CREATE INDEX by_cat ..."})

(def ^:private wh-sortkey
  {:name nil :kind :sortkey :access-method nil :is-unique false :is-primary false
   :is-valid true :key-columns ["a" "b"] :include-columns [] :partial-predicate nil :definition nil})

(def ^:private wh-dba
  {:name "dba_made" :kind :btree :access-method "btree" :is-unique false :is-primary false
   :is-valid true :key-columns ["price"] :include-columns [] :partial-predicate nil :definition "CREATE INDEX dba_made ..."})

(deftest match-key-test
  (testing "named kinds key by name; managed and warehouse agree"
    (is (= "by_cat" (reconcile/managed-match-key managed-btree)))
    (is (= "by_cat" (reconcile/match-key wh-btree))))
  (testing "unnamed inline kinds key by kind+columns, so managed and warehouse agree"
    (is (= [:sortkey ["a" "b"]] (reconcile/managed-match-key managed-sortkey)))
    (is (= [:sortkey ["a" "b"]] (reconcile/match-key wh-sortkey)))))

(deftest warehouse->structured-test
  (testing "classical btree -> structured, uniqueness preserved"
    (is (= {:kind :btree :name "dba_made" :columns [{:name "price"}]}
           (reconcile/warehouse->structured wh-dba)))
    (is (= {:kind :btree :name "by_cat" :columns [{:name "name"}] :unique true}
           (reconcile/warehouse->structured wh-btree))))
  (testing "sortkey style is unrecoverable, defaults to :compound"
    (is (= {:kind :sortkey :style :compound :columns [{:name "a"} {:name "b"}]}
           (reconcile/warehouse->structured wh-sortkey))))
  (testing "skip-index type comes from the access-method"
    (is (= {:kind :skip-index :name "by_minmax" :columns [{:name "a"}] :type :minmax}
           (reconcile/warehouse->structured
            {:name "by_minmax" :kind :skip-index :access-method "minmax" :key-columns ["a"]}))))
  (testing "an expression-only index (no column names) can't be represented -> nil"
    (is (nil? (reconcile/warehouse->structured
               {:name "fc_expr" :kind :btree :access-method "btree" :key-columns [nil]})))))

(deftest merge-indexes-test
  (testing "managed-only: rendered from its stored structured, flagged managed"
    (let [[e] (reconcile/merge-indexes 7 [managed-btree] [])]
      (is (true? (:metabase_managed e)))
      (is (= (:structured managed-btree) (:structured e)))
      (is (= 1 (:id e)))
      (is (= :pending (:status e)))))
  (testing "warehouse-only (DBA index): converted, flagged unmanaged, no app-DB bookkeeping"
    (let [[e] (reconcile/merge-indexes 7 [] [wh-dba])]
      (is (false? (:metabase_managed e)))
      (is (= 7 (:transform_id e)))
      (is (= :succeeded (:status e)))
      (is (= {:kind :btree :name "dba_made" :columns [{:name "price"}]} (:structured e)))
      (is (nil? (:id e)))
      (is (nil? (:created_by e)))))
  (testing "a managed index that also exists in the warehouse is listed once, as the managed entry"
    (let [merged (reconcile/merge-indexes 7 [managed-btree] [wh-btree])]
      (is (= 1 (count merged)))
      (is (true? (:metabase_managed (first merged))))
      (is (= 1 (:id (first merged))))))
  (testing "a managed inline sortkey matches the warehouse sortkey by kind+columns, listed once"
    (let [merged (reconcile/merge-indexes 7 [managed-sortkey] [wh-sortkey])]
      (is (= 1 (count merged)))
      (is (true? (:metabase_managed (first merged))))))
  (testing "mix: a matched managed index, plus a DBA index alongside it"
    (let [merged  (reconcile/merge-indexes 7 [managed-btree] [wh-btree wh-dba])
          by-flag (group-by :metabase_managed merged)]
      (is (= 2 (count merged)))
      (is (= 1 (count (get by-flag true))))
      (is (= 1 (count (get by-flag false))))
      (is (= "dba_made" (-> (get by-flag false) first :structured :name))))))

(deftest fetch-warehouse-indexes-test
  (testing "delegates to the driver method"
    (with-redefs [metabase.driver/fetch-table-indexes (fn [_driver _db _schema _table] [wh-btree])]
      (is (= [wh-btree]
             (reconcile/fetch-warehouse-indexes {:engine :postgres} "public" "t")))))
  (testing "swallows driver/connection errors and returns []"
    (with-redefs [metabase.driver/fetch-table-indexes (fn [& _] (throw (ex-info "boom" {})))]
      (is (= [] (reconcile/fetch-warehouse-indexes {:engine :postgres} "public" "t"))))))

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

(deftest normalize-managed-test
  (let [n (reconcile/normalize-managed managed-btree)]
    (is (= "by_cat" (:name n)))
    (is (= :btree (:kind n)))
    (is (= ["name"] (:key-columns n)))
    (is (true? (:is-unique n)))
    (is (true? (:metabase_managed n)))
    (is (= 1 (:id n)))
    (is (= :pending (:status n)))))

(deftest match-key-test
  (testing "named kinds key by name"
    (is (= "by_cat" (reconcile/match-key (reconcile/normalize-managed managed-btree))))
    (is (= "by_cat" (reconcile/match-key wh-btree))))
  (testing "unnamed inline kinds key by kind+columns, so managed and warehouse agree"
    (is (= [:sortkey ["a" "b"]] (reconcile/match-key (reconcile/normalize-managed managed-sortkey))))
    (is (= [:sortkey ["a" "b"]] (reconcile/match-key wh-sortkey)))))

(deftest merge-indexes-test
  (testing "managed-only: present_in_warehouse false"
    (let [[e] (reconcile/merge-indexes [managed-btree] [])]
      (is (true? (:metabase_managed e)))
      (is (false? (:present_in_warehouse e)))))
  (testing "warehouse-only (DBA index): metabase_managed false, no lifecycle"
    (let [[e] (reconcile/merge-indexes [] [wh-dba])]
      (is (false? (:metabase_managed e)))
      (is (true? (:present_in_warehouse e)))
      (is (nil? (:id e)))))
  (testing "matched by name collapses to one entry, warehouse fields canonical"
    (let [merged (reconcile/merge-indexes [managed-btree] [wh-btree])]
      (is (= 1 (count merged)))
      (is (true? (:metabase_managed (first merged))))
      (is (true? (:present_in_warehouse (first merged))))
      (is (= "CREATE INDEX by_cat ..." (:definition (first merged))))
      (is (= 1 (:id (first merged))))))
  (testing "matched inline sortkey collapses via kind+columns"
    (let [merged (reconcile/merge-indexes [managed-sortkey] [wh-sortkey])]
      (is (= 1 (count merged)))
      (is (true? (:present_in_warehouse (first merged))))))
  (testing "mix: managed matched + managed unmatched + DBA"
    (let [merged (reconcile/merge-indexes [managed-btree managed-sortkey] [wh-btree wh-dba])]
      (is (= 3 (count merged)))
      (is (= #{true} (set (map #(contains? % :metabase_managed) merged)))))))

(deftest fetch-warehouse-indexes-test
  (testing "delegates to the driver method"
    (with-redefs [metabase.driver/fetch-table-indexes (fn [_driver _db _schema _table] [wh-btree])]
      (is (= [wh-btree]
             (reconcile/fetch-warehouse-indexes {:engine :postgres} "public" "t")))))
  (testing "swallows driver/connection errors and returns []"
    (with-redefs [metabase.driver/fetch-table-indexes (fn [& _] (throw (ex-info "boom" {})))]
      (is (= [] (reconcile/fetch-warehouse-indexes {:engine :postgres} "public" "t"))))))

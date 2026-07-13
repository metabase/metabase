(ns metabase.indexes.reconcile-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver]
   [metabase.indexes.reconcile :as reconcile]))

(def ^:private managed-btree
  {:id 1 :transform_id 7 :index_name "by_cat"
   :structured {:kind :btree :name "by_cat" :columns [{:name "name"}] :unique true}
   :status :create-pending :error_message nil :created_by 3 :last_executed_at nil})

(def ^:private managed-sortkey
  {:id 2 :transform_id 7 :index_name "sortkey"
   :structured {:kind :sortkey :style :compound :columns [{:name "a"} {:name "b"}]}
   :status :create-pending :error_message nil :created_by 3 :last_executed_at nil})

(def ^:private wh-btree
  {:name "by_cat" :kind :btree :access-method "btree" :is-unique true :is-primary false
   :is-valid true :key-columns ["name"] :include-columns [] :partial-predicate nil :definition "CREATE INDEX by_cat ..."})

(def ^:private wh-sortkey
  {:name nil :kind :sortkey :access-method "compound" :is-unique false :is-primary false
   :is-valid true :key-columns ["a" "b"] :include-columns [] :partial-predicate nil :definition nil})

(def ^:private managed-distkey
  {:id 3 :transform_id 7 :index_name "distkey"
   :structured {:kind :distkey :style :key :columns [{:name "category"}]}
   :status :create-pending :error_message nil :created_by 3 :last_executed_at nil})

(def ^:private wh-distkey
  {:name nil :kind :distkey :access-method "key" :is-unique false :is-primary false
   :is-valid true :key-columns ["category"] :include-columns [] :partial-predicate nil :definition nil})

(def ^:private managed-even-distkey
  {:id 4 :transform_id 7 :index_name "distkey"
   :structured {:kind :distkey :style :even}
   :status :pending :error_message nil :created_by 3 :last_executed_at nil})

(def ^:private wh-even-distkey
  {:name nil :kind :distkey :access-method "even" :is-unique false :is-primary false
   :is-valid true :key-columns [] :include-columns [] :partial-predicate nil :definition "DISTSTYLE EVEN"})

(def ^:private wh-dba
  {:name "dba_made" :kind :btree :access-method "btree" :is-unique false :is-primary false
   :is-valid true :key-columns ["price"] :include-columns [] :partial-predicate nil :definition "CREATE INDEX dba_made ..."})

(deftest match-key-test
  (testing "named kinds key by name; managed and warehouse agree"
    (is (= {:kind :named :name "by_cat"} (reconcile/managed-match-key managed-btree)))
    (is (= {:kind :named :name "by_cat"} (reconcile/match-key wh-btree))))
  (testing "unnamed inline kinds key by kind+columns, so managed and warehouse agree"
    (is (= {:kind :sortkey :key-columns ["a" "b"]} (reconcile/managed-match-key managed-sortkey)))
    (is (= {:kind :sortkey :key-columns ["a" "b"]} (reconcile/match-key wh-sortkey))))
  (testing "a key distkey is keyed by its style + column, so managed and warehouse agree (#76331)"
    (is (= {:kind :distkey :style "key" :key-columns ["category"]} (reconcile/managed-match-key managed-distkey)))
    (is (= {:kind :distkey :style "key" :key-columns ["category"]} (reconcile/match-key wh-distkey))))
  (testing "distkey keys are style-aware: column-less even and all don't collapse onto the same key"
    (is (= {:kind :distkey :style "even" :key-columns []} (reconcile/managed-match-key managed-even-distkey)))
    (is (= {:kind :distkey :style "even" :key-columns []} (reconcile/match-key wh-even-distkey)))
    (is (not= (reconcile/managed-match-key managed-even-distkey)
              (reconcile/managed-match-key (assoc-in managed-even-distkey [:structured :style] :all))))
    (testing "a stray column on a non-key request is ignored, so it still matches the column-less warehouse distkey"
      (is (= {:kind :distkey :style "even" :key-columns []}
             (reconcile/managed-match-key (assoc-in managed-even-distkey [:structured :columns] [{:name "x"}])))))))

(deftest merge-indexes-test
  (testing "managed + present: observed from the warehouse, flagged managed, request carries lifecycle + structured"
    (let [[e] (reconcile/merge-indexes [managed-btree] [wh-btree])]
      (is (true? (:metabase_managed e)))
      (is (true? (:present_in_warehouse e)))
      (is (= "by_cat" (:name e)))
      (is (true? (:is_unique e)))
      (is (= 1 (-> e :request :id)))
      (is (= :create-pending (-> e :request :status)))
      (is (= (:structured managed-btree) (-> e :request :structured)))))
  (testing "DBA (warehouse-only): observed, unmanaged, no request bookkeeping"
    (let [[e] (reconcile/merge-indexes [] [wh-dba])]
      (is (false? (:metabase_managed e)))
      (is (true? (:present_in_warehouse e)))
      (is (= "dba_made" (:name e)))
      (is (= ["price"] (:key_columns e)))
      (is (nil? (:request e)))))
  (testing "managed + absent: projected from its declared structured, present_in_warehouse false"
    (let [[e] (reconcile/merge-indexes [managed-btree] [])]
      (is (true? (:metabase_managed e)))
      (is (false? (:present_in_warehouse e)))
      (is (= "by_cat" (:name e)))
      (is (true? (:is_unique e)))
      (is (= :create-pending (-> e :request :status)))))
  (testing "a managed inline sortkey matches the warehouse sortkey by kind+columns, listed once as managed"
    (let [merged (reconcile/merge-indexes [managed-sortkey] [wh-sortkey])]
      (is (= 1 (count merged)))
      (is (true? (:metabase_managed (first merged))))
      (is (true? (:present_in_warehouse (first merged))))))
  (testing "a managed inline distkey matches the warehouse distkey by style+columns, listed once as managed"
    (let [merged (reconcile/merge-indexes [managed-distkey] [wh-distkey])]
      (is (= 1 (count merged)))
      (is (true? (:metabase_managed (first merged))))
      (is (true? (:present_in_warehouse (first merged))))))
  (testing "a managed even distkey matches an even warehouse distkey, but not an all one"
    (is (true? (:present_in_warehouse (first (reconcile/merge-indexes [managed-even-distkey] [wh-even-distkey])))))
    (let [merged  (reconcile/merge-indexes [managed-even-distkey]
                                           [(assoc wh-even-distkey :access-method "all")])
          managed (first (filter :metabase_managed merged))]
      (is (false? (:present_in_warehouse managed)))))
  (testing "mix: a matched managed index, plus a DBA index alongside it"
    (let [merged  (reconcile/merge-indexes [managed-btree] [wh-btree wh-dba])
          by-flag (group-by :metabase_managed merged)]
      (is (= 2 (count merged)))
      (is (= 1 (count (get by-flag true))))
      (is (= 1 (count (get by-flag false))))
      (is (= "dba_made" (-> (get by-flag false) first :name))))))

(deftest classify-index-outcomes-test
  (testing "each managed request lands in the bucket its warehouse presence + applicability imply"
    (let [present     (reconcile/warehouse-key-set [wh-btree]) ; only the named by_cat index physically present
          succ-row    managed-btree                            ; applicable + present -> succeeded
          fail-row    managed-sortkey                          ; applicable + absent  -> failed
          kept-row    (assoc managed-btree   :id 8 :status :delete-pending)  ; delete-pending + present -> kept
          dropped-row (assoc managed-sortkey :id 9 :status :delete-pending)  ; delete-pending + absent  -> row dropped
          out         (reconcile/classify-index-outcomes [succ-row fail-row kept-row dropped-row] present)]
      (is (= [1] (map :id (:succeeded out))))
      (is (= [2] (map :id (:failed out))))
      (is (= [8] (map :id (:delete-pending out))))
      (is (= [9] (map :id (:delete-row out))))
      (testing "every row is classified into exactly one bucket"
        (is (= 4 (reduce + (map count (vals out)))))))))

(deftest fetch-warehouse-indexes-test
  (testing "delegates to the driver method"
    (with-redefs [metabase.driver/fetch-table-indexes (fn [_driver _db _schema _table] [wh-btree])]
      (is (= [wh-btree]
             (reconcile/fetch-warehouse-indexes {:engine :postgres} "public" "t")))))
  (testing "preserves a successful empty warehouse response"
    (with-redefs [metabase.driver/fetch-table-indexes (fn [& _] [])]
      (is (= [] (reconcile/fetch-warehouse-indexes {:engine :postgres} "public" "t")))))
  (testing "swallows driver/connection errors and returns nil"
    (with-redefs [metabase.driver/fetch-table-indexes (fn [& _] (throw (ex-info "boom" {})))]
      (is (nil? (reconcile/fetch-warehouse-indexes {:engine :postgres} "public" "t"))))))

(ns hooks.metabase.toucan.big-table-select-test
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clj-kondo.impl.utils]
   [clojure.test :refer :all]
   [hooks.metabase.toucan.big-table-select :as big-table-select]))

(defn- lint [form]
  (binding [clj-kondo.impl.utils/*ctx* {:config     {:linters {:metabase/big-table-eager-select {:level :warning}}}
                                        :ignores    (atom nil)
                                        :findings   (atom [])
                                        :namespaces (atom {})}]
    (big-table-select/lint {:node (hooks/parse-string (pr-str form))})
    @(:findings clj-kondo.impl.utils/*ctx*)))

(deftest ^:parallel flags-eager-select-against-big-table-test
  (testing "select-fn-set against a big table is flagged"
    (is (=? [{:type :metabase/big-table-eager-select}]
            (lint '(t2/select-fn-set :db_id :model/DataPermissions :group_id 1)))))
  (testing "select-pks-set (model is first arg) is flagged"
    (is (=? [{:type :metabase/big-table-eager-select}]
            (lint '(t2/select-pks-set :model/Field :table_id 1)))))
  (testing "select-fn->fn (model is third arg) is flagged"
    (is (=? [{:type :metabase/big-table-eager-select}]
            (lint '(t2/select-fn->fn :id :name :model/Table)))))
  (testing "plain select against a big table is flagged"
    (is (=? [{:type :metabase/big-table-eager-select}]
            (lint '(t2/select :model/Field :table_id 1)))))
  (testing "toucan2.core-qualified is also recognized"
    (is (=? [{:type :metabase/big-table-eager-select}]
            (lint '(toucan2.core/select-fn-set :db_id :model/DataPermissions))))))

(deftest ^:parallel allows-bounded-selects-test
  (testing ":select-distinct in options opts out"
    (is (empty? (lint '(t2/select-fn-set :db_id :model/DataPermissions
                                         :group_id 1
                                         {:select-distinct [:db_id]})))))
  (testing ":limit in options opts out"
    (is (empty? (lint '(t2/select-fn-set :db_id :model/DataPermissions {:limit 100})))))
  (testing ":select projection in options opts out"
    (is (empty? (lint '(t2/select :model/Field {:select [:id] :limit 10}))))))

(deftest ^:parallel ignores-unrelated-calls-test
  (testing "eager select against a non-big table is fine"
    (is (empty? (lint '(t2/select-fn-set :id :model/Card :collection_id 1)))))
  (testing "reducible selects are not flagged (streaming escape hatch)"
    (is (empty? (lint '(t2/select-reducible :model/Field)))))
  (testing "non-toucan fns are ignored"
    (is (empty? (lint '(some.other/select-fn-set :db_id :model/Field))))))

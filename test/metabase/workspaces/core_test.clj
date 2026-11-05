(ns metabase.workspaces.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.workspaces.core :as ws]))

(def ^:private schema-map
  {"sales" "mb__isolation_ab12c_17_s42_sales"
   "finance" "mb__isolation_ab12c_17_s43_finance"})

(def ^:private remappings
  {{:schema "sales" :table "orders_daily"} {:schema "mb__isolation_ab12c_17_s42_sales" :table "orders_daily"}})

(deftest scratch-and-canonical-target-test
  (is (= {:schema "mb__isolation_ab12c_17_s42_sales" :name "x"}
         (ws/scratch-target schema-map {:schema "sales" :name "x"})))
  (is (= {:schema "sales" :name "x"}
         (ws/canonical-target schema-map {:schema "mb__isolation_ab12c_17_s42_sales" :name "x"})))
  (testing "a schema the map does not name is left alone"
    (is (= {:schema "marketing" :name "x"} (ws/scratch-target schema-map {:schema "marketing" :name "x"})))
    (is (= {:schema "sales" :name "x"} (ws/canonical-target schema-map {:schema "sales" :name "x"})))))

(deftest remapped-table-test
  (is (= {:id 7 :schema "mb__isolation_ab12c_17_s42_sales" :name "orders_daily"}
         (ws/remapped-table remappings {:id 7 :schema "sales" :name "orders_daily"})))
  (is (nil? (ws/remapped-table remappings {:id 8 :schema "sales" :name "orders"}))))

(deftest workspace-tables-xf-test
  (let [described [{:schema "sales" :name "orders" :description "main"}
                   {:schema "sales" :name "orders_daily" :description "main copy"}
                   {:schema "mb__isolation_ab12c_17_s42_sales" :name "orders_daily" :description "scratch copy"}
                   {:schema "mb__isolation_ab12c_17_s43_finance" :name "stray" :description "unremapped scratch"}
                   {:schema "finance" :name "ledger" :description "main"}]]
    (is (= [{:schema "sales" :name "orders" :description "main"}
            {:schema "sales" :name "orders_daily" :description "scratch copy"}
            {:schema "finance" :name "ledger" :description "main"}]
           (into [] (ws/workspace-tables-xf schema-map remappings) described))
        "scratch tables are hidden; a remapped table is the scratch copy under the main name")
    (testing "a remapped table whose scratch copy is gone is not reported"
      (is (= [{:schema "sales" :name "orders"}]
             (into [] (ws/workspace-tables-xf schema-map remappings)
                   [{:schema "sales" :name "orders"} {:schema "sales" :name "orders_daily"}]))))))

(ns metabase-enterprise.workspaces.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- workspace-instance [database-name]
  {:name      "orders-cleanup"
   :databases {database-name {:schemas {"sales"   "mb__isolation_ab12c_17_s42_sales"
                                        "finance" "mb__isolation_ab12c_17_s43_finance"}}}})

(defn- as-response
  "`instance` as the test client reads it back: JSON with keywordized keys."
  [instance]
  (json/decode+kw (json/encode instance)))

(defn- remapping [database-id from-schema scratch table]
  {:database_id database-id, :from_schema from-schema, :from_table_name table,
   :to_schema scratch, :to_table_name table})

(defmacro ^:private with-clean-workspace! [& body]
  `(mt/with-premium-features #{:workspaces}
     (mt/with-temporary-setting-values [~'instance-workspace nil]
       (mt/with-model-cleanup [:model/TableRemapping]
         ~@body))))

(deftest install-and-remove-workspace-test
  (with-clean-workspace!
    (mt/with-temp [:model/Database {db-id :id, db-name :name} {:name (mt/random-name), :engine :postgres}]
      (is (= {:data nil, :can_write true}
             (mt/user-http-request :crowberto :get 200 "ee/workspace-instance/current")))
      (testing "POST installs the workspace, keyed by database name"
        (is (= (as-response (workspace-instance db-name))
               (mt/user-http-request :crowberto :post 200 "ee/workspace-instance/current" (workspace-instance db-name))))
        (is (= {:data (as-response (workspace-instance db-name)), :can_write true}
               (mt/user-http-request :crowberto :get 200 "ee/workspace-instance/current"))))
      (testing "GET /table-remappings lists the recorded remappings, with null for an unused level"
        (t2/insert! :model/TableRemapping (remapping db-id "sales" "mb__isolation_ab12c_17_s42_sales" "orders_daily"))
        (is (=? [{:database_id db-id, :from_db nil, :from_schema "sales", :from_table_name "orders_daily",
                  :to_db nil, :to_schema "mb__isolation_ab12c_17_s42_sales", :to_table_name "orders_daily",
                  :created_at some?}]
                (mt/user-http-request :crowberto :get 200 "ee/workspace-instance/table-remappings"))))
      (testing "DELETE turns workspace mode off and deletes every remapping"
        (mt/user-http-request :crowberto :delete 204 "ee/workspace-instance/current")
        (is (= {:data nil, :can_write true}
               (mt/user-http-request :crowberto :get 200 "ee/workspace-instance/current")))
        (is (zero? (t2/count :model/TableRemapping)))))))

(deftest post-clears-stale-remappings-test
  (with-clean-workspace!
    (mt/with-temp [:model/Database {db-id :id, db-name :name} {:name (mt/random-name), :engine :postgres}]
      (mt/user-http-request :crowberto :post 200 "ee/workspace-instance/current" (workspace-instance db-name))
      (t2/insert! :model/TableRemapping [(remapping db-id "sales" "mb__isolation_ab12c_17_s42_sales" "kept")
                                         (remapping db-id "finance" "mb__isolation_ab12c_17_s43_finance" "dropped")])
      (testing "a new map keeps the remappings it still backs and deletes the rest"
        (mt/user-http-request :crowberto :post 200 "ee/workspace-instance/current"
                              {:name      "orders-cleanup"
                               :databases {db-name {:schemas {"sales"   "mb__isolation_ab12c_17_s42_sales"
                                                              "finance" "mb__isolation_ab12c_17_s99_finance"}}}})
        (is (= ["kept"] (t2/select-fn-vec :from_table_name :model/TableRemapping)))))))

(deftest post-dropping-a-database-clears-its-remappings-test
  (with-clean-workspace!
    (mt/with-temp [:model/Database {db-1 :id, name-1 :name} {:name (mt/random-name), :engine :postgres}
                   :model/Database {db-2 :id, name-2 :name} {:name (mt/random-name), :engine :postgres}]
      (mt/user-http-request :crowberto :post 200 "ee/workspace-instance/current"
                            {:name      "w"
                             :databases {name-1 {:schemas {"sales" "scratch_sales"}}
                                         name-2 {:schemas {"sales" "scratch_sales"}}}})
      (t2/insert! :model/TableRemapping [(remapping db-1 "sales" "scratch_sales" "t")
                                         (remapping db-2 "sales" "scratch_sales" "t")])
      (testing "a map without a database deletes every remapping of that database"
        (mt/user-http-request :crowberto :post 200 "ee/workspace-instance/current"
                              {:name "w", :databases {name-1 {:schemas {"sales" "scratch_sales"}}}})
        (is (= [db-1] (t2/select-fn-vec :database_id :model/TableRemapping)))))))

(deftest post-errors-test
  (with-clean-workspace!
    (mt/with-temp [:model/Database {db-name :name} {:name (mt/random-name), :engine :postgres}
                   :model/Database {dup-1 :id}     {:name "duplicate name", :engine :postgres}
                   :model/Database {dup-2 :id}     {:name "duplicate name", :engine :postgres}]
      (testing "a database name that matches no database"
        (is (= "No database is named \"no such database\"."
               (mt/user-http-request :crowberto :post 400 "ee/workspace-instance/current"
                                     (workspace-instance "no such database")))))
      (testing "a database name that matches several lists them"
        (is (= (format "Several databases are named \"duplicate name\": [%d %d]." dup-1 dup-2)
               (mt/user-http-request :crowberto :post 400 "ee/workspace-instance/current"
                                     (workspace-instance "duplicate name")))))
      (testing "a map that sends two main schemas to one scratch namespace, or uses a main schema as scratch"
        (doseq [schemas [{"sales" "scratch", "finance" "scratch"}
                         {"sales" "finance", "finance" "scratch"}]]
          (is (=? {:specific-errors some?}
                  (mt/user-http-request :crowberto :post 400 "ee/workspace-instance/current"
                                        {:name "w", :databases {db-name {:schemas schemas}}})))))
      (testing "a database whose engine workspaces don't support yet"
        (mt/with-temp [:model/Database {h2-name :name} {:name (mt/random-name), :engine :h2}]
          (is (re-find #"support only Postgres-family"
                       (mt/user-http-request :crowberto :post 400 "ee/workspace-instance/current"
                                             (workspace-instance h2-name))))))
      (testing "an empty map"
        (is (=? {:errors some?}
                (mt/user-http-request :crowberto :post 400 "ee/workspace-instance/current"
                                      {:name "w", :databases {}}))))
      (is (= {:data nil, :can_write true}
             (mt/user-http-request :crowberto :get 200 "ee/workspace-instance/current"))
          "a refused POST installs nothing"))))

(deftest locked-by-env-var-test
  (with-clean-workspace!
    (mt/with-temp [:model/Database {db-name :name} {:name (mt/random-name), :engine :postgres}]
      (mt/with-temp-env-var-value! [:mb-instance-workspace (json/encode (workspace-instance db-name))]
        (is (= {:data (as-response (workspace-instance db-name)), :can_write false}
               (mt/user-http-request :crowberto :get 200 "ee/workspace-instance/current")))
        (is (re-find #"MB_INSTANCE_WORKSPACE"
                     (mt/user-http-request :crowberto :post 400 "ee/workspace-instance/current"
                                           (workspace-instance db-name))))
        (is (re-find #"MB_INSTANCE_WORKSPACE"
                     (mt/user-http-request :crowberto :delete 400 "ee/workspace-instance/current")))))))

(deftest permissions-test
  (with-clean-workspace!
    (testing "every route is superuser-only"
      (doseq [[method path] [[:get "ee/workspace-instance/current"]
                             [:delete "ee/workspace-instance/current"]
                             [:get "ee/workspace-instance/table-remappings"]]]
        (mt/user-http-request :rasta method 403 path))
      (mt/user-http-request :rasta :post 403 "ee/workspace-instance/current" (workspace-instance "x")))
    (testing "the routes need the :workspaces feature"
      (mt/with-premium-features #{}
        (mt/user-http-request :crowberto :get 402 "ee/workspace-instance/current")))))

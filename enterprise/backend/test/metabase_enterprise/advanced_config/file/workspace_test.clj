(ns metabase-enterprise.advanced-config.file.workspace-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.advanced-config.file :as advanced-config.file]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- unlock! []
  (reset! @#'ws/locked-by-config-file? false))

(defmacro ^:private with-clean-workspace! [& body]
  `(binding [advanced-config.file/*supported-versions* {:min 1, :max 1}]
     (mt/with-premium-features #{:config-text-file :workspaces}
       (mt/with-temporary-setting-values [~'instance-workspace nil]
         (mt/with-model-cleanup [:model/TableRemapping]
           (try
             ~@body
             (finally
               (unlock!))))))))

(defn- workspace-section
  "The `workspace:` section as YAML parsing reads it: keyword keys."
  [database-name]
  {:name      "orders-cleanup"
   :databases {(keyword database-name) {:schemas {:sales   "mb__isolation_k3f9q2xa_s42_sales"
                                                  :finance "mb__isolation_k3f9q2xa_s43_finance"}}}})

(defn- workspace-instance [database-name]
  {:name      "orders-cleanup"
   :databases {database-name {:schemas {"sales"   "mb__isolation_k3f9q2xa_s42_sales"
                                        "finance" "mb__isolation_k3f9q2xa_s43_finance"}}}})

(deftest workspace-section-installs-and-locks-test
  (with-clean-workspace!
    (mt/with-temp [:model/Database {db-name :name} {:name (mt/random-name), :engine :postgres}]
      (is (= :ok (advanced-config.file/initialize! {:version 1
                                                    :config  {:workspace (workspace-section db-name)}})))
      (testing "the workspace is installed with string database and schema names"
        (is (= (workspace-instance db-name) (ws/instance-workspace)))
        (is (true? (ws/workspace-mode?))))
      (testing "GET /current says the API can't change it"
        (is (=? {:data {:name "orders-cleanup"}, :can_write false}
                (mt/user-http-request :crowberto :get 200 "ee/workspace-instance/current"))))
      (testing "POST and DELETE /current are refused"
        (is (= "This instance's workspace is locked by config.yml and can't be changed through the API."
               (mt/user-http-request :crowberto :post 400 "ee/workspace-instance/current"
                                     (workspace-instance db-name))))
        (is (= "This instance's workspace is locked by config.yml and can't be changed through the API."
               (mt/user-http-request :crowberto :delete 400 "ee/workspace-instance/current")))
        (is (= (workspace-instance db-name) (ws/instance-workspace)))))))

(deftest workspace-section-runs-after-databases-test
  (testing "the workspace section names databases the databases section creates, so it goes last whatever the file order"
    (is (= [:settings :users :databases :workspace]
           (map first (#'advanced-config.file/sort-by-initialization-order
                       [[:workspace {}] [:users {}] [:settings {}] [:databases {}]]))))))

(deftest workspace-section-errors-test
  (with-clean-workspace!
    (mt/with-temp [:model/Database {db-name :name} {:name (mt/random-name), :engine :postgres}]
      (testing "a section that fails its spec"
        (doseq [section [{:databases {(keyword db-name) {:schemas {:sales "s"}}}}
                         {:name "w", :databases {}}
                         {:name "w", :databases {(keyword db-name) {:schemas {}}}}
                         {:name "w", :databases {(keyword db-name) {:schemas {:sales ""}}}}]]
          (is (thrown? Exception
                       (advanced-config.file/initialize! {:version 1, :config {:workspace section}})))))
      (testing "a database name that matches no database"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"No database is named \"nope\""
                              (advanced-config.file/initialize! {:version 1
                                                                 :config  {:workspace (workspace-section "nope")}}))))
      (testing "two main schemas sent to one scratch namespace"
        (is (thrown? Exception
                     (advanced-config.file/initialize!
                      {:version 1
                       :config  {:workspace {:name      "w"
                                             :databases {(keyword db-name) {:schemas {:sales "x", :finance "x"}}}}}}))))
      (testing "a refused section installs nothing and does not lock"
        (is (nil? (ws/instance-workspace)))
        (is (false? (ws/workspace-locked?)))))))

(deftest workspace-section-needs-config-text-file-test
  (with-clean-workspace!
    (mt/with-temp [:model/Database {db-name :name} {:name (mt/random-name), :engine :postgres}]
      (mt/with-premium-features #{:workspaces}
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #":config-text-file"
                              (advanced-config.file/initialize! {:version 1
                                                                 :config  {:workspace (workspace-section db-name)}}))))
      (is (nil? (ws/instance-workspace)))
      (is (zero? (t2/count :model/TableRemapping))))))

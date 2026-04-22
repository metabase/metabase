(ns metabase-enterprise.advanced-config.file.workspace-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.advanced-config.file.interface :as advanced-config.file.i]
   [metabase-enterprise.advanced-config.file.workspace :as acf.ws]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.remapping-poll :as remapping-poll]))

(deftest normalize-test
  (testing "Looks up db-id-by-name to change the indexing of the databases map"
    (is (= {:name "github"
            :databases
            {2
             {:input_schemas ["raw_github"]
              :output_schema "mb__isolation_754bd_github"
              :name          "Analytics Data Warehouse"
              :id            2}}}
           (acf.ws/normalize
            {:db-id-by-name {"Analytics Data Warehouse" 2}}
            {:name "github"
             :databases
             {(keyword "Analytics Data Warehouse")
              {:input_schemas ["raw_github"]
               :output_schema "mb__isolation_754bd_github"}}})))))

(deftest initialize-section-does-not-poll-test
  (testing "initialize-section! :workspace MUST NOT call remapping-poll/poll-once! synchronously"
    (let [polled? (atom false)]
      (with-redefs [ws/set-config!            (fn [_] nil)
                    remapping-poll/poll-once! (fn [] (reset! polled? true))]
        ;; Minimal section-config: no databases. The eager first-tick would still fire on the
        ;; current implementation regardless of section contents.
        (advanced-config.file.i/initialize-section! :workspace {:name "empty" :databases {}}))
      (is (false? @polled?)
          "initialize-section! should not synchronously call poll-once!: a slow/unreachable warehouse would stall boot"))))

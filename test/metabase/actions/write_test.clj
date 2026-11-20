(ns ^:mb/driver-tests metabase.actions.write-test
  (:require
   [clojure.test :refer :all]
   [metabase.actions.test-util :as actions.tu]
   [metabase.actions.write :as action.write]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest create-action-refuses-disabled-database-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (mt/with-actions-test-data
      (actions.tu/with-actions-disabled
        (mt/with-model-cleanup [:model/Action]
          (let [action {:type          :query
                        :name          "Query"
                        :database_id   (mt/id)
                        :dataset_query (lib/native-query (mt/metadata-provider) "select 1")}]
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Actions are not enabled"
                                  (action.write/create-action! action)))
            (testing "the statement-level insert has no such check"
              (is (pos-int? (action.write/insert! action))))))))))

(deftest create-action-requires-one-primary-key-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (mt/with-actions-test-data-and-actions-enabled
      (mt/with-model-cleanup [:model/Action]
        (is (pos-int? (action.write/create-action! {:type     :implicit
                                                    :name     "Table"
                                                    :kind     :row/create
                                                    :table_id (mt/id :categories)})))))))

(deftest update-action-refuses-archiving-model-action-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (mt/with-actions-test-data-and-actions-enabled
      (actions.tu/with-actions [_                   {:type          :model
                                                     :dataset_query (lib/query (mt/metadata-provider)
                                                                               (lib.metadata/table (mt/metadata-provider) (mt/id :categories)))}
                                {:keys [action-id]} {:type :query}]
        (let [existing (t2/select-one :model/Action :id action-id)]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"can't be archived"
                                (action.write/update-action! {:id action-id :archived true} existing)))
          (is (false? (t2/select-one-fn :archived :model/Action :id action-id))))))))

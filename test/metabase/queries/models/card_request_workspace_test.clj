(ns metabase.queries.models.card-request-workspace-test
  "A Card is shared, so a request in a workspace does not store the column list of its queries, which read the
  workspace's copies."
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.workspaces.core :as workspaces]
   [toucan2.core :as t2]))

(defn- table-query [table-key]
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id table-key)))))

(def ^:private result-metadata
  [{:name "ID" :display_name "ID" :base_type :type/BigInteger}])

(deftest a-request-in-a-workspace-stores-no-card-columns-test
  (mt/with-temp [:model/Card {card-id :id} {:dataset_query   (table-query :venues)
                                            :result_metadata result-metadata}]
    (mt/with-dynamic-fn-redefs [workspaces/workspace-bound? (constantly true)]
      (testing "a Card made in a workspace stores no column list"
        (mt/with-temp [:model/Card {new-id :id} {:dataset_query   (table-query :venues)
                                                 :result_metadata result-metadata}]
          (is (nil? (t2/select-one-fn :result_metadata :model/Card :id new-id)))))
      (testing "an update in a workspace keeps the stored column list"
        (t2/update! :model/Card :id card-id {:name "renamed" :result_metadata [{:name "WS" :display_name "WS"
                                                                                :base_type :type/Text}]})
        (is (= ["ID"] (map :name (t2/select-one-fn :result_metadata :model/Card :id card-id)))))
      (testing "a new query in a workspace clears it: the stored list is of the old query"
        (t2/update! :model/Card :id card-id {:dataset_query (table-query :checkins)})
        (is (nil? (t2/select-one-fn :result_metadata :model/Card :id card-id)))))))

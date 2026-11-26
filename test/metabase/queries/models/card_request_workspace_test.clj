(ns metabase.queries.models.card-request-workspace-test
  "A Card is shared, so a request in a workspace does not store the column list of its queries, which read the
  workspace's copies."
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.queries.models.card :as card]
   [metabase.test :as mt]
   [metabase.workspaces.core :as workspaces]
   [toucan2.core :as t2]))

(defn- table-query [table-key]
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id table-key)))))

(def ^:private result-metadata
  [{:name "ID" :display_name "ID" :base_type :type/BigInteger}])

(deftest a-request-in-a-workspace-stores-no-card-columns-test
  (mt/with-model-cleanup [:model/Card]
    (let [[{card-id :id}] (card/create-cards! [{:name                   "card"
                                                :display                :table
                                                :visualization_settings {}
                                                :dataset_query          (table-query :venues)
                                                :result_metadata        result-metadata
                                                :creator_id             (mt/user->id :crowberto)}])]
      (mt/with-dynamic-fn-redefs [workspaces/workspace-bound? (constantly true)]
        (testing "a Card made in a workspace stores no column list"
          (let [[{new-id :id}] (card/create-cards! [{:name                   "new card"
                                                     :display                :table
                                                     :visualization_settings {}
                                                     :dataset_query          (table-query :venues)
                                                     :result_metadata        result-metadata
                                                     :creator_id             (mt/user->id :crowberto)}])]
            (is (nil? (t2/select-one-fn :result_metadata :model/Card :id new-id)))))
        (testing "an update in a workspace keeps the stored column list"
          (card/update-cards! [{:id card-id :name "renamed" :result_metadata [{:name "WS" :display_name "WS"
                                                                               :base_type :type/Text}]}])
          (is (= "renamed" (t2/select-one-fn :name :model/Card :id card-id)))
          (is (= ["ID"] (map :name (t2/select-one-fn :result_metadata :model/Card :id card-id)))))
        (testing "a new query in a workspace clears it: the stored list is of the old query"
          (card/update-cards! [{:id card-id :dataset_query (table-query :checkins)}])
          (is (nil? (t2/select-one-fn :result_metadata :model/Card :id card-id))))))))

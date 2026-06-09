(ns metabase.explorations.models.exploration-query-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest segment-name-hydrate-test
  (testing ":segment_name batched-hydrate resolves the linked Segment's name and is nil when :segment_id is nil"
    (mt/with-temp [:model/Segment s {:name       "my-seg"
                                     :table_id   (mt/id :venues)
                                     :definition (let [mp (mt/metadata-provider)]
                                                   (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                                                       (lib/filter (lib/= (lib.metadata/field mp (mt/id :venues :price)) 1))))}
                   :model/Card metric {:type          :metric
                                       :dataset_query (let [mp (mt/metadata-provider)]
                                                        (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                                                            (lib/aggregate (lib/count))))}
                   :model/Exploration e {}
                   :model/ExplorationThread th {:exploration_id (:id e)}
                   :model/ExplorationThreadGroup g {:exploration_thread_id (:id th)}
                   :model/ExplorationQuery q-seg  {:exploration_thread_id (:id th)
                                                   :card_id    (:id metric)
                                                   :group_id   (:id g)
                                                   :dimension_id "d1"
                                                   :segment_id (:id s)
                                                   :position   0}
                   :model/ExplorationQuery q-bare {:exploration_thread_id (:id th)
                                                   :card_id    (:id metric)
                                                   :group_id   (:id g)
                                                   :dimension_id "d1"
                                                   :position   1}]
      (let [hyd (t2/hydrate (t2/select :model/ExplorationQuery
                                       :id [:in [(:id q-seg) (:id q-bare)]]
                                       {:order-by [[:position :asc]]})
                            :segment_name)]
        (is (= [{:id (:id q-seg)  :segment_id (:id s) :segment_name "my-seg"}
                {:id (:id q-bare) :segment_id nil     :segment_name nil}]
               (mapv #(select-keys % [:id :segment_id :segment_name]) hyd)))))))

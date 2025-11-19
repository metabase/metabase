(ns metabase-enterprise.workspaces.models.workspace-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.util.workspaces :as u.workspaces]
   [toucan2.core :as t2]))

(defn- assert-workspace-filter
  [model workspace-id global tenant]
  (let [kvargs [:name [:in [(:name global) (:name tenant)]]]]
    (testing "default select is scoped to workspace_id IS NULL"
      (is (= #{(:id global)}
             (apply t2/select-pks-set model kvargs))))
    (testing "explicit workspace scope returns tenant rows"
      (is (= #{(:id tenant)}
             (apply t2/select-pks-set model :workspace_id workspace-id kvargs))))
    (testing "primary-key lookups bypass the default workspace filter"
      (is (= (:id tenant)
             (t2/select-one-pk model :toucan/pk (:id tenant)))))))

(deftest workspace-default-filter-applies-to-core-models-test
  (testing "Queries are properly filtered if no id/workspace_id were supplied in the filters"
    (mt/with-temp [:model/Workspace {ws-id :id} {}
                   :model/Collection c1 {}
                   :model/Collection c2 {:workspace_id ws-id}]
      (testing "Collections"
        (assert-workspace-filter :model/Collection ws-id c1 c2))

      (testing "Tables"
        (mt/with-temp [:model/Table t1 {}
                       :model/Table t2 {:workspace_id ws-id}]
          (assert-workspace-filter :model/Table ws-id t1 t2)))

      (testing "Fields"
        (mt/with-temp [:model/Field f1 {}
                       :model/Field f2 {:workspace_id ws-id}]
          (assert-workspace-filter :model/Field ws-id f1 f2)))

      (testing "Cards"
        (mt/with-temp [:model/Card card1 {:collection_id (:id c1)}
                       :model/Card card2 {:collection_id (:id c2)
                                          :workspace_id  ws-id}]
          (assert-workspace-filter :model/Card ws-id card1 card2)))

      (testing "Transforms"
        (mt/with-premium-features #{:transforms}
          (mt/with-temp [:model/Transform x1 {}
                         :model/Transform x2 {:workspace_id ws-id}]
            (assert-workspace-filter :model/Transform ws-id x1 x2)))))))

(deftest apply-default-workspace-filter-test
  (testing "Filter logic is applied correctly to incoming arguments"
    (are [kvargs res] (= {:kv-args res} (u.workspaces/apply-default-workspace-filter :model/Card {:kv-args kvargs}))
      {:name "foo"}           {:name                     "foo"
                               :report_card/workspace_id [:is nil]}
      {}                      {:report_card/workspace_id [:is nil]}
      {:workspace_id 42}      {:workspace_id 42}
      {:card.workspace_id 42} {:card.workspace_id 42}
      {:id 1}                 {:id 1}
      {:card.id 1}            {:card.id 1}
      {:toucan/pk 99}         {:toucan/pk 99})))

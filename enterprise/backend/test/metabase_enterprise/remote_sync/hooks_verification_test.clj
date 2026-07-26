(ns metabase-enterprise.remote-sync.hooks-verification-test
  "Cross-model regression coverage for the workspace_id stamp/immutable/parent-workspace hooks wired into
  content models' before-insert/before-update (see metabase.remote-sync.core)."
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest stamp-on-insert-test
  (mt/with-temp [:model/Workspace wt {:branch (str (random-uuid))}]
    (binding [api/*current-workspace-id* (:id wt)]
      (mt/with-temp [:model/Collection coll {:name "wt coll"}]
        (is (= (:id wt) (:workspace_id coll))))
      (mt/with-temp [:model/Collection parent {:name "wt parent"}
                     :model/Collection transforms-parent {:name "wt transforms parent" :namespace "transforms"}
                     :model/Card card {:collection_id (:id parent) :name "wt card"}
                     :model/Dashboard dash {:collection_id (:id parent) :name "wt dash"}
                     :model/DashboardCard dc {:dashboard_id (:id dash) :card_id (:id card)}
                     :model/Transform transform {:name "wt transform" :collection_id (:id transforms-parent)
                                                 :source {:type :query :query {}}}]
        (is (= (:id wt) (:workspace_id card)))
        (is (= (:id wt) (:workspace_id dash)))
        (is (= (:id wt) (:workspace_id dc)))
        (is (= (:id wt) (:workspace_id transform)))
        (mt/with-temp [:model/ParameterCard pc {:card_id (:id card)
                                                :parameterized_object_type "card"
                                                :parameterized_object_id (:id card)
                                                :parameter_id "abc"}]
          (is (= (:id wt) (:workspace_id pc)))))
      (mt/with-temp [:model/Segment segment {:table_id (mt/id :venues) :name "wt segment"}]
        (is (= (:id wt) (:workspace_id segment))))))
  (testing "no active workspace -> nil"
    (mt/with-temp [:model/Collection coll {:name "no wt"}]
      (is (nil? (:workspace_id coll))))))

(deftest immutable-workspace-test
  (mt/with-temp [:model/Workspace wt {:branch (str (random-uuid))}]
    (binding [api/*current-workspace-id* (:id wt)]
      (mt/with-temp [:model/Collection coll {:name "wt coll"}
                     :model/Card card {:collection_id (:id coll) :name "wt card"}
                     :model/Segment segment {:table_id (mt/id :venues) :name "wt segment"}]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"workspace_id cannot be changed"
                              (t2/update! :model/Collection (:id coll) {:workspace_id nil})))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"workspace_id cannot be changed"
                              (t2/update! :model/Card (:id card) {:workspace_id nil})))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"workspace_id cannot be changed"
                              (t2/update! :model/Segment (:id segment) {:workspace_id nil})))))))

(deftest parent-workspace-test
  (mt/with-temp [:model/Workspace wt {:branch (str (random-uuid))}
                 :model/Collection main-coll {:name "main coll"}]
    (binding [api/*current-workspace-id* (:id wt)]
      (mt/with-temp [:model/Collection wt-coll-a {:name "wt coll a"}
                     :model/Collection wt-coll-b {:name "wt coll b"}
                     :model/Card card {:collection_id (:id wt-coll-a) :name "wt card"}]
        (testing "moving within the same workspace is allowed"
          (t2/update! :model/Card (:id card) {:collection_id (:id wt-coll-b)})
          (is (= (:id wt-coll-b) (t2/select-one-fn :collection_id :model/Card :id (:id card)))))
        (testing "moving across workspace boundary is blocked"
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot move content"
                                (t2/update! :model/Card (:id card) {:collection_id (:id main-coll)}))))
        (testing "Collection location-based parent check: moving into a different-workspace parent is blocked"
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot move content"
                                (t2/update! :model/Collection (:id wt-coll-a) {:location (str "/" (:id main-coll) "/")}))))
        (testing "Collection location-based parent check: moving within the same workspace is allowed"
          (t2/update! :model/Collection (:id wt-coll-a) {:location (str "/" (:id wt-coll-b) "/")})
          (is (= (str "/" (:id wt-coll-b) "/") (t2/select-one-fn :location :model/Collection :id (:id wt-coll-a)))))))))

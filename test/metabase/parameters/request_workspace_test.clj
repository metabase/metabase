(ns metabase.parameters.request-workspace-test
  "Field values in the workspace of a request's worktree: they are read from the workspace's copies, so they are stored
  for that workspace only."
  (:require
   [clojure.test :refer :all]
   [metabase.parameters.field-values :as params.field-values]
   [metabase.test :as mt]
   [metabase.workspaces.core :as workspaces]
   [toucan2.core :as t2]))

(deftest field-values-are-keyed-by-workspace-test
  (let [field (t2/select-one :model/Field :id (mt/id :venues :price))]
    (testing "outside a workspace, the full values of a field are keyed by the field alone"
      (is (= {:field-id (:id field)} (params.field-values/hash-input-for-field-values field))))
    (testing "in a workspace, the values are keyed by the workspace too, so no other workspace or production reads them"
      (workspaces/with-workspace-id 12
        (is (= {:field-id (:id field) :workspace-id 12} (params.field-values/hash-input-for-field-values field)))
        (is (= {:field-id    (:id field)
                :workspace-id 12
                :constraints  [{:field-id 1 :op := :value 2}]}
               (params.field-values/hash-input-for-field-values field [{:field-id 1 :op := :value 2}])))))))

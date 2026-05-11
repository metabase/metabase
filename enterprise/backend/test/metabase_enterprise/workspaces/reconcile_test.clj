(ns metabase-enterprise.workspaces.reconcile-test
  "Tests for the workspace database reconciliation engine."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.workspaces.reconcile :as reconcile]))

(deftest diff-workspace-databases-test
  (testing "empty → empty = no operations"
    (is (= []
           (reconcile/diff-workspace-databases [] []))))

  (testing "empty → one = :add with insert-row + provision steps"
    (let [ops (reconcile/diff-workspace-databases
               []
               [{:database_id 1 :input [{:schema "PUBLIC"}]}])]
      (is (= 1 (count ops)))
      (is (= {:op-type         :add
              :database_id     1
              :wsd-id          nil
              :requested_input [{:schema "PUBLIC"}]}
             (dissoc (first ops) :steps)))
      (is (= [{:op :op/insert-row :database_id 1 :input [{:schema "PUBLIC"}]}
              {:op :op/provision  :database_id 1}]
             (:steps (first ops))))))

  (testing "one provisioned → empty = :remove with deprovision + delete-row steps"
    (let [ops (reconcile/diff-workspace-databases
               [{:database_id 1 :id 10 :input [{:schema "PUBLIC"}] :status :provisioned}]
               [])]
      (is (= 1 (count ops)))
      (is (= {:op-type :remove :database_id 1 :wsd-id 10 :requested_input nil}
             (dissoc (first ops) :steps)))
      (is (= [{:op :op/deprovision :database_id 1 :wsd-id 10}
              {:op :op/delete-row  :database_id 1 :wsd-id 10}]
             (:steps (first ops))))))

  (testing "one unprovisioned → empty = :remove with delete-row only (no deprovision)"
    (let [ops (reconcile/diff-workspace-databases
               [{:database_id 1 :id 10 :input [{:schema "PUBLIC"}] :status :unprovisioned}]
               [])]
      (is (= [{:op :op/delete-row :database_id 1 :wsd-id 10}]
             (:steps (first ops))))))

  (testing "unchanged database = no operations"
    (is (= []
           (reconcile/diff-workspace-databases
            [{:database_id 1 :id 10 :input [{:schema "PUBLIC"}] :status :provisioned}]
            [{:database_id 1 :input [{:schema "PUBLIC"}]}]))))

  (testing "input order doesn't matter — same set = no operations"
    (is (= []
           (reconcile/diff-workspace-databases
            [{:database_id 1 :id 10 :input [{:schema "A"} {:schema "B"}] :status :provisioned}]
            [{:database_id 1 :input [{:schema "B"} {:schema "A"}]}]))))

  (testing "changed input on provisioned row = :modify with deprovision + update-input + provision"
    (let [ops (reconcile/diff-workspace-databases
               [{:database_id 1 :id 10 :input [{:schema "PUBLIC"}] :status :provisioned}]
               [{:database_id 1 :input [{:schema "PUBLIC"} {:schema "ANALYTICS"}]}])]
      (is (= {:op-type         :modify
              :database_id     1
              :wsd-id          10
              :requested_input [{:schema "PUBLIC"} {:schema "ANALYTICS"}]}
             (dissoc (first ops) :steps)))
      (is (= [{:op :op/deprovision  :database_id 1 :wsd-id 10}
              {:op :op/update-input :database_id 1 :wsd-id 10
               :input [{:schema "PUBLIC"} {:schema "ANALYTICS"}]}
              {:op :op/provision    :database_id 1 :wsd-id 10}]
             (:steps (first ops))))))

  (testing "changed input on unprovisioned row = :modify with update-input + provision (no deprovision)"
    (let [ops (reconcile/diff-workspace-databases
               [{:database_id 1 :id 10 :input [{:schema "OLD"}] :status :unprovisioned}]
               [{:database_id 1 :input [{:schema "NEW"}]}])]
      (is (= [{:op :op/update-input :database_id 1 :wsd-id 10 :input [{:schema "NEW"}]}
              {:op :op/provision    :database_id 1 :wsd-id 10}]
             (:steps (first ops))))))

  (testing "mixed add + remove + modify: operations ordered removals → modifications → additions"
    (let [current [{:database_id 1 :id 10 :input [{:schema "A"}] :status :provisioned}   ;; unchanged
                   {:database_id 2 :id 20 :input [{:schema "OLD"}] :status :provisioned}  ;; modify
                   {:database_id 3 :id 30 :input [{:schema "X"}] :status :provisioned}]   ;; remove
          desired [{:database_id 1 :input [{:schema "A"}]}                                 ;; keep
                   {:database_id 2 :input [{:schema "NEW"}]}                               ;; modify
                   {:database_id 4 :input [{:schema "FRESH"}]}]                            ;; add
          ops     (reconcile/diff-workspace-databases current desired)
          by-type (group-by :op-type ops)]
      ;; 3 operations total (unchanged db-1 produces none)
      (is (= 3 (count ops)))
      ;; ordering: remove → modify → add
      (is (= [:remove :modify :add] (mapv :op-type ops)))
      ;; remove db-3
      (is (= {:op-type :remove :database_id 3 :wsd-id 30 :requested_input nil}
             (dissoc (first (:remove by-type)) :steps)))
      (is (= [{:op :op/deprovision :database_id 3 :wsd-id 30}
              {:op :op/delete-row  :database_id 3 :wsd-id 30}]
             (:steps (first (:remove by-type)))))
      ;; modify db-2
      (is (= {:op-type :modify :database_id 2 :wsd-id 20
              :requested_input [{:schema "NEW"}]}
             (dissoc (first (:modify by-type)) :steps)))
      ;; add db-4
      (is (= {:op-type :add :database_id 4 :wsd-id nil
              :requested_input [{:schema "FRESH"}]}
             (dissoc (first (:add by-type)) :steps))))))

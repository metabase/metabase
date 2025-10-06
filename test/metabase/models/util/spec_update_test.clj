(ns metabase.models.util.spec-update-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.util.spec-update :as spec-update]
   [toucan2.core :as t2]))

(defn do-track-operations!
  "Implementation function that tracks Toucan2 operations and returns the tracked operations."
  [f]
  (let [operations (atom [])
        id-counter (atom 1)
        track!     (fn [op args]
                     (swap! operations conj (cons op args))
                     1)]
    (with-redefs [t2/insert!              (fn [& args] (track! :insert! args))
                  t2/insert-returning-pk! (fn [& args] (track! :insert-returning-pk! args) (swap! id-counter inc) @id-counter)
                  t2/update!              (fn [& args] (track! :update! args))
                  t2/delete!              (fn [& args] (track! :delete! args))]
      (f)
      @operations)))

(defmacro with-tracked-operations!
  "Tracks Toucan2 operations within the body and returns the tracked operations.
   Usage: (with-tracked-operations (do-something))"
  [& body]
  `(do-track-operations! (fn [] ~@body)))

(spec-update/define-spec basic-spec
  "spec for testing."
  {:model        :root
   :compare-cols [:name]
   :nested-specs {:foo  {:model        :foo
                         :compare-cols [:name]
                         :fk-column    :root_id}}})

(deftest basic-create-test
  (testing "Creating a new record with no existing data"
    (let [new-data {:name "Test"
                    :foo  {:name "Foo 1"}}]
      (is (= [[:insert-returning-pk! :root {:name "Test"}]
              [:insert-returning-pk! :foo {:name "Foo 1" :root_id 2}]]
             (with-tracked-operations!
               (spec-update/do-update! nil new-data basic-spec)))))))

(deftest basic-update-root-test
  (testing "Updating root record with no nested model changes"
    (let [existing-data {:id   1
                         :name "Test"
                         :foo  {:id      2
                                :name    "Foo 1"
                                :root_id 1}}
          new-data      (-> existing-data
                            (assoc :name "Updated Test"))]
      (is (= [[:update! :root 1 {:name "Updated Test"}]]
             (with-tracked-operations!
               (spec-update/do-update! existing-data new-data basic-spec)))))))

(deftest basic-update-nested-test
  (testing "Updating both root and nested model"
    (let [existing-data {:id   1
                         :name "Test"
                         :foo  {:id      2
                                :name    "Foo 1"
                                :root_id 1}}
          new-data      (-> existing-data
                            (assoc :name "Updated Test")
                            (assoc-in [:foo :name] "Updated Foo"))]
      (is (= [[:update! :root 1 {:name "Updated Test"}]
              [:update! :foo 2 {:name "Updated Foo" :root_id 1}]]
             (with-tracked-operations!
               (spec-update/do-update! existing-data new-data basic-spec)))))))

(deftest basic-update-no-changes-test
  (testing "No changes results in no operations"
    (let [existing-data {:id   1
                         :name "Test"
                         :foo  {:id      2
                                :name    "Foo 1"
                                :root_id 1}}
          new-data      existing-data]
      (is (= []
             (with-tracked-operations!
               (spec-update/do-update! existing-data new-data basic-spec)))))))

(deftest basic-update-compare-cols-test
  (testing "only columns in :compare-cols are used to compare changes"
    (let [existing-data {:id   1
                         :name "Test"
                         :unrelated "xyz"
                         :foo  {:id      2
                                :name    "Foo 1"
                                :unrelated "abc"
                                :root_id 1}}
          new-data      (-> existing-data
                            (assoc :urenlated "new")
                            (assoc-in [:foo :unrelated] "new"))]
      (is (= []
             (with-tracked-operations!
               (spec-update/do-update! existing-data new-data basic-spec)))))))

(deftest basic-update-replace-nested-test
  (testing "Replacing nested model with a new one"
    (let [existing-data {:id   1
                         :name "Test"
                         :foo  {:id      2
                                :name    "Foo 1"
                                :root_id 1}}
          new-data      (assoc existing-data :foo {:id      3
                                                   :name    "New Foo"
                                                   :root_id 1})]
      (is (= [[:delete! :foo 2]
              [:insert-returning-pk! :foo {:name "New Foo" :root_id 1}]]
             (with-tracked-operations!
               (spec-update/do-update! existing-data new-data basic-spec)))))))

(deftest basic-delete-test
  (testing "Deleting nested model by setting it to nil"
    (let [existing-data {:id   1
                         :name "Test"
                         :foo  {:id      2
                                :name    "Foo 1"
                                :root_id 1}}
          new-data      (assoc existing-data :foo nil)]
      (is (= [[:delete! :foo 2]]
             (with-tracked-operations!
               (spec-update/do-update! existing-data new-data basic-spec))))))

  (testing "Deleting root record deletes nested model"
    (let [existing-data {:id   1
                         :name "Test"
                         :foo  {:id      2
                                :name    "Foo 1"
                                :root_id 1}}]
      (is (= [[:delete! :root 1]
              [:delete! :foo 2]]
             (with-tracked-operations!
               (spec-update/do-update! existing-data nil basic-spec)))))))

(spec-update/define-spec multi-row-spec
  "A spec with multi-row nested models"
  {:model :root
   :compare-cols [:name]
   :extra-cols   [:unrelated]
   :nested-specs {:bars {:model :bar
                         :multi-row? true
                         :fk-column :root_id
                         :extra-cols [:unrelated]
                         :compare-cols [:name]}}})

(deftest multi-row-create-test
  (testing "Creating root with nested multi-row models"
    (let [new-data {:id 1
                    :name "Test"
                    :bars [{:id 2
                            :name "Bar 1"
                            :unrelated "xyz"}
                           {:id 3
                            :name "Bar 2"
                            :unrelated "abc"}]}]
      (is (= [[:insert-returning-pk! :root {:name "Test"}]
              [:insert! :bar [{:name "Bar 1" :root_id 2 :unrelated "xyz"}
                              {:name "Bar 2" :root_id 2 :unrelated "abc"}]]]
             (with-tracked-operations!
               (spec-update/do-update! nil new-data multi-row-spec)))))))

(deftest multi-row-update-test
  (testing "Updating nested multi-row models"
    (let [existing-data {:id 1
                         :name "Test"
                         :bars [{:id 1
                                 :root_id 1
                                 :name "Bar 1"
                                 :unrelated "xyz"}
                                {:id 2
                                 :root_id 1
                                 :name "Bar 2"
                                 :unrelated "abc"}]}
          new-data      (-> existing-data
                            (assoc-in [:bars 0 :name] "Updated Bar 1")
                            (assoc-in [:bars 0 :unrelated] "changed")
                            (update :bars conj {:id 3 :name "Bar 3" :unrelated "def"}))]
      (is (= [[:insert! :bar [{:name "Bar 3" :root_id 1 :unrelated "def"}]]
              [:update! :bar 1 {:name "Updated Bar 1" :root_id 1 :unrelated "changed"}]]
             (with-tracked-operations!
               (spec-update/do-update! existing-data new-data multi-row-spec)))))))

(deftest multi-row-delete-test
  (testing "Deleting nested multi-row models"
    (let [existing-data {:id 1
                         :name "Test"
                         :bars [{:id 2
                                 :name "Bar 1"
                                 :unrelated "xyz"}
                                {:id 3
                                 :name "Bar 2"
                                 :unrelated "abc"}]}
          new-data      (update existing-data :bars
                                (fn [bars]
                                  [(first bars)]))]
      (is (= [[:delete! :bar :id [:in [3]]]]
             (with-tracked-operations!
               (spec-update/do-update! existing-data new-data multi-row-spec)))))))

(deftest multi-row-no-change-test
  (testing "No changes results in no operations"
    (let [existing-data {:id 1
                         :name "Test"
                         :bars [{:id 2
                                 :name "Bar 1"
                                 :unrelated "xyz"}
                                {:id 3
                                 :name "Bar 2"
                                 :unrelated "abc"}]}
          new-data      (-> existing-data
                            (assoc-in [:bars 0 :unrelated] "changed")
                            (assoc-in [:bars 1 :unrelated] "changed"))]
      (is (= []
             (with-tracked-operations!
               (spec-update/do-update! existing-data new-data multi-row-spec)))))))

(deftest extra-cols-test
  (testing "extra-cols are not used to compare but will be included when insert/update"
    (let [spec {:model :foo
                :id-col :id
                :compare-cols [:name]
                :extra-cols [:unrelated]
                :nested-specs {:bars {:model :bar
                                      :id-col :id
                                      :multi-row? true
                                      :fk-column :foo_id
                                      :compare-cols [:name]
                                      :extra-cols [:unrelated]}}}
          existing-data {:id 1
                         :name "Test"
                         :unrelated "abc"
                         :bars [{:id 2
                                 :name "Bar 1"
                                 :unrelated "xyz"}]}]
      ;; No operations when only extra-cols change
      (is (= []
             (with-tracked-operations!
               (spec-update/do-update! existing-data
                                       (-> existing-data
                                           (assoc :unrelated "changed")
                                           (assoc-in [:bars 0 :unrelated] "changed"))
                                       spec))))
      ;; Operations include extra-cols when other columns change
      (is (= [[:update! :foo 1 {:name "Updated Test" :unrelated "changed"}]
              [:insert! :bar [{:name "Bar 2" :unrelated "def" :foo_id 1}]]
              [:update! :bar 2 {:name "Updated Bar 1" :unrelated "changed" :foo_id 1}]]
             (with-tracked-operations!
               (spec-update/do-update! existing-data
                                       (-> existing-data
                                           (assoc :name "Updated Test")
                                           (assoc :unrelated "changed")
                                           (assoc-in [:bars 0 :name] "Updated Bar 1")
                                           (assoc-in [:bars 0 :unrelated] "changed")
                                           (update :bars conj {:id 3
                                                               :name "Bar 2"
                                                               :unrelated "def"}))
                                       spec)))))))

(spec-update/define-spec complex-model-spec
  "A complex nested model spec with multiple levels"
  {:model :foo
   :id-col :uuid
   :compare-cols [:name]
   :nested-specs {:bars {:model :bar
                         :compare-cols [:name]
                         :multi-row? true
                         :fk-column :foo_id
                         :nested-specs {:quxes {:model :bar_qux
                                                :compare-cols [:name]
                                                :multi-row? true
                                                :fk-column :bar_id}}}
                  :qux {:model :qux
                        :compare-cols [:name]
                        :fk-column :foo_id
                        :nested-specs {:bar {:model :qux_bar
                                             :compare-cols [:name]
                                             :fk-column :qux_id}}}}})

(deftest complex-nested-model-test
  (testing "Complex nested model with multiple levels"
    (let [existing-data {:uuid "abc-123"
                         :name "Foo"
                         :bars [{:id 10
                                 :name "Bar 1"
                                 :foo_id "abc-123"
                                 :quxes [{:id 100
                                          :name "qux1"
                                          :bar_id 10}
                                         {:id 101
                                          :name "qux2"
                                          :bar_id 10}]}
                                {:id 11
                                 :name "Bar 2"
                                 :foo_id "abc-123"
                                 :quxes [{:id 102
                                          :name "qux3"
                                          :bar_id 11}]}]
                         :qux {:id 20
                               :name "Qux 1"
                               :foo_id "abc-123"
                               :bar {:id 200
                                     :name "bar1"
                                     :qux_id 20}}}
          new-data (-> existing-data
                       ;; update foo name
                       (assoc :name "Updated Foo")
                       (update :bars (fn [bars]
                                       ;; update the first bar, then delete the second bar
                                       ;; and add a new bar
                                       [(-> (first bars)
                                            (assoc :name "Updated Bar 1")
                                            ;; update the first qux, then delete the second qux
                                            ;; and add a new qux
                                            (assoc :quxes [(-> (first (:quxes (first bars)))
                                                               (assoc :name "updated qux1"))
                                                           {:id 103
                                                            :name "new qux"}]))
                                        {:id 12
                                         :name "New Bar"
                                         :quxes [{:id 104
                                                  :name "qux4"}]}]))
                       (update :qux (fn [qux]
                                      (-> qux
                                          (assoc :name "Updated Qux")
                                          (assoc-in [:bar :name] "updated bar")))))]
      (testing "Complex update with additions updates and deletions at multiple levels"
        (is (= [[:update! :foo "abc-123" {:name "Updated Foo"}]
                [:insert-returning-pk! :bar {:name "New Bar" :foo_id "abc-123"}]
                [:insert! :bar_qux [{:name "qux4" :bar_id 2}]]
                [:delete! :bar :id [:in [11]]]
                [:update! :bar 10 {:name "Updated Bar 1" :foo_id "abc-123"}]
                [:insert! :bar_qux [{:name "new qux" :bar_id 10}]]
                [:delete! :bar_qux :id [:in [101]]]
                [:update! :bar_qux 100 {:name "updated qux1" :bar_id 10}]
                [:update! :qux 20 {:name "Updated Qux" :foo_id "abc-123"}]
                [:update! :qux_bar 200 {:name "updated bar" :qux_id 20}]]
               (with-tracked-operations!
                 (spec-update/do-update! existing-data new-data complex-model-spec))))))))

(spec-update/define-spec nested-multi-row-spec
  "A spec with nested multi-row models"
  {:model :foo
   :compare-cols [:name]
   :nested-specs {:bars {:model        :bar
                         :compare-cols [:name]
                         :multi-row?   true
                         :fk-column    :foo_id
                         :nested-specs {:quxes {:model        :bar_qux
                                                :compare-cols [:name]
                                                :multi-row?   true
                                                :fk-column    :bar_id}}}}})

(deftest nested-sequential-test
  (testing "adding 2 layers of nested sequential updates"
    (let [existing-data {:id   1
                         :name "foo"}]
      (is (= [[:update! :foo 1 {:name "FOO"}]
              [:insert-returning-pk! :bar {:name "Bar 1" :foo_id 1}]
              [:insert! :bar_qux [{:name "qux1" :bar_id 2} {:name "qux2" :bar_id 2}]]
              [:insert-returning-pk! :bar {:name "Bar 2" :foo_id 1}]]
             (with-tracked-operations!
               (spec-update/do-update!
                existing-data
                (-> (assoc existing-data :name "FOO")
                    (assoc :bars [{:name  "Bar 1"
                                   :quxes [{:name "qux1"}
                                           {:name "qux2"}]}
                                  {:name "Bar 2"}]))
                nested-multi-row-spec))))))

  (testing "adding entity of the 2nd nested layer"
    (let [existing-data {:id   1
                         :name "foo"
                         :bars [{:id 10
                                 :name "Bar 1"
                                 :foo_id "abc-123"
                                 :quxes []}]}]
      (is (= [[:insert! :bar_qux [{:bar_id 10
                                   :name "qux1"}]]]
             (with-tracked-operations!
               (spec-update/do-update!
                existing-data
                (update-in existing-data [:bars 0 :quxes] conj {:name "qux1"})
                nested-multi-row-spec))))))

  (testing "updating then adding entity of the 2nd nested layer"
    (let [existing-data {:id   1
                         :name "foo"
                         :bars [{:id 10
                                 :name "Bar 1"
                                 :foo_id "abc-123"
                                 :quxes []}]}]
      (is (= [[:update! :bar 10 {:name "Updated Bar 1", :foo_id 1}]
              [:insert! :bar_qux [{:bar_id 10
                                   :name "qux1"}]]]
             (with-tracked-operations!
               (spec-update/do-update!
                existing-data
                (-> existing-data
                    (assoc-in [:bars 0 :name] "Updated Bar 1")
                    (update-in [:bars 0 :quxes] conj {:name "qux1"}))
                nested-multi-row-spec)))))))

(spec-update/define-spec ref-in-parent-spec
  "A spec with ref-in-parent references"
  {:model :parent
   :compare-cols [:name]
   :nested-specs {:child {:model :child
                          :compare-cols [:name]
                          :ref-in-parent :child_id}}})

(deftest ref-in-parent-create-test
  (testing "Creating parent with referenced child (ref-in-parent)"
    (let [new-data {:name "Parent"
                    :child {:name "Child"}}]
      (is (= [[:insert-returning-pk! :child {:name "Child"}]
              [:insert-returning-pk! :parent {:name "Parent" :child_id 2}]]
             (with-tracked-operations!
               (spec-update/do-update! nil new-data ref-in-parent-spec)))))))

(deftest ref-in-parent-update-test
  (testing "Updating referenced child model"
    (let [existing-data {:id 1
                         :name "Parent"
                         :child_id 2
                         :child {:id 2
                                 :name "Child"}}
          new-data (assoc-in existing-data [:child :name] "Updated Child")]
      (is (= [[:update! :child 2 {:name "Updated Child"}]]
             (with-tracked-operations!
               (spec-update/do-update! existing-data new-data ref-in-parent-spec)))))))

(deftest ref-in-parent-delete-test
  (testing "Deleting referenced child model"
    (let [existing-data {:id 1
                         :name "Parent"
                         :child_id 2
                         :child {:id 2
                                 :name "Child"}}
          new-data (assoc existing-data :child nil)]
      (is (= [[:delete! :child 2]
              [:update! :parent 1 {:name "Parent", :child_id nil}]]
             (with-tracked-operations!
               (spec-update/do-update! existing-data new-data ref-in-parent-spec)))))))

(deftest ref-in-parent-replace-test
  (testing "Replacing referenced child with new child"
    (let [existing-data {:id 1
                         :name "Parent"
                         :child_id 1
                         :child {:id 1
                                 :name "Child"}}
          new-data (assoc existing-data :child {:name "New Child"})]
      (is (= [[:delete! :child 1]
              [:insert-returning-pk! :child {:name "New Child"}]
              [:update! :parent 1 {:name "Parent", :child_id 2}]]
             (with-tracked-operations!
               (spec-update/do-update! existing-data new-data ref-in-parent-spec)))))))

(deftest ref-in-parent-set-nil-test
  (testing "Setting referenced child to nil"
    (let [existing-data {:id 1
                         :name "Parent"
                         :child_id 2
                         :child {:id 2
                                 :name "Child"}}
          new-data (assoc existing-data :child nil)]
      (is (= [[:delete! :child 2]
              [:update! :parent 1 {:name "Parent"
                                   :child_id nil}]]
             (with-tracked-operations!
               (spec-update/do-update! existing-data new-data ref-in-parent-spec)))))))

(deftest ref-in-parent-new-child-test
  (testing "Setting referenced child to nil"
    (let [existing-data {:id 1
                         :name "Parent"}
          new-data (assoc existing-data :child {:name "Child"})]
      (is (= [[:insert-returning-pk! :child {:name "Child"}]
              [:update! :parent 1 {:name "Parent", :child_id 2}]]
             (with-tracked-operations!
               (spec-update/do-update! existing-data new-data ref-in-parent-spec)))))))

(spec-update/define-spec complex-ref-in-parent-spec
  "A spec with multiple ref-in-parent references"
  {:model :order
   :compare-cols [:number]
   :nested-specs {:customer {:model :customer
                             :compare-cols [:name]
                             :ref-in-parent :customer_id}
                  :items {:model        :item
                          :multi-row?   true
                          :fk-column    :order_id
                          :compare-cols [:product_name :quantity]}
                  :payment {:model         :payment
                            :compare-cols  [:amount]
                            :ref-in-parent :payment_id
                            :nested-specs  {:processor {:model         :payment_processor
                                                        :compare-cols  [:name]
                                                        :ref-in-parent :processor_id}}}}})

(deftest complex-ref-in-parent-test
  (testing "Complex flow with multiple ref-in-parent relationships"
    (let [existing-data {:id 1
                         :number "ORD-123"
                         :customer_id 10
                         :payment_id 20
                         :customer {:id 10
                                    :name "Existing Customer"}
                         :items [{:id 101
                                  :order_id 1
                                  :product_name "Item 1"
                                  :quantity 2}]
                         :payment {:id 20
                                   :amount 100.00
                                   :processor_id 30
                                   :processor {:id 30
                                               :name "PayCo"}}}
          new-data (-> existing-data
                       (assoc-in [:customer :name] "Updated Customer")
                       (assoc-in [:payment :processor :name] "Updated PayCo")
                       (update :items conj {:product_name "Item 2" :quantity 1}))]
      (is (= [[:update! :customer 10 {:name "Updated Customer"}]
              [:update! :payment_processor 30 {:name "Updated PayCo"}]
              [:insert! :item [{:product_name "Item 2" :quantity 1 :order_id 1}]]]
             (with-tracked-operations!
               (spec-update/do-update! existing-data new-data complex-ref-in-parent-spec)))))))

(spec-update/define-spec multi-row-with-ref-spec
  "A spec with ref-in-parent inside a multi-row spec"
  {:model :project
   :compare-cols [:name]
   :nested-specs {:tasks {:model :task
                          :multi-row? true
                          :fk-column :project_id
                          :compare-cols [:description]
                          :nested-specs {:assignee {:model :user
                                                    :compare-cols [:name]
                                                    :ref-in-parent :assignee_id}}}}})

(deftest multi-row-with-ref-create-test
  (testing "Creating a project with tasks that have assignee references"
    (let [new-data {:name "New Project"
                    :tasks [{:description "Task 1"
                             :assignee {:name "User 1"}}
                            {:description "Task 2"
                             :assignee {:name "User 2"}}]}]
      (is (= [[:insert-returning-pk! :project {:name "New Project"}]
              [:insert-returning-pk! :user {:name "User 1"}]
              [:insert-returning-pk! :task {:description "Task 1", :project_id 2, :assignee_id 3}]
              [:insert-returning-pk! :user {:name "User 2"}]
              [:insert-returning-pk! :task {:description "Task 2", :project_id 2, :assignee_id 5}]]
             (with-tracked-operations!
               (spec-update/do-update! nil new-data multi-row-with-ref-spec)))))))

(deftest multi-row-with-ref-update-test
  (testing "Updating tasks and their assignees in a project"
    (let [existing-data {:id 1
                         :name "Project"
                         :tasks [{:id 10
                                  :description "Task 1"
                                  :project_id 1
                                  :assignee_id 100
                                  :assignee {:id 100
                                             :name "User A"}}
                                 {:id 11
                                  :description "Task 2"
                                  :project_id 1
                                  :assignee_id 101
                                  :assignee {:id 101
                                             :name "User B"}}]}
          new-data (-> existing-data
                       (assoc-in [:tasks 0 :assignee :name] "Updated User A")
                       (assoc-in [:tasks 1 :description] "Updated Task 2"))]
      (is (= [[:update! :task 11 {:description "Updated Task 2", :project_id 1, :assignee_id 101}]
              [:update! :user 100 {:name "Updated User A"}]]
             (with-tracked-operations!
               (spec-update/do-update! existing-data new-data multi-row-with-ref-spec)))))))

(deftest multi-row-with-ref-replace-test
  (testing "Replacing an assignee in a task"
    (let [existing-data {:id 1
                         :name "Project"
                         :tasks [{:id 10
                                  :description "Task 1"
                                  :project_id 1
                                  :assignee_id 100
                                  :assignee {:id 100
                                             :name "User A"}}]}
          new-data (assoc-in existing-data [:tasks 0 :assignee] {:name "New Assignee"})]
      (is (= [[:delete! :user 100]
              [:insert-returning-pk! :user {:name "New Assignee"}]
              [:update! :task 10 {:description "Task 1", :project_id 1, :assignee_id 2}]]
             (with-tracked-operations!
               (spec-update/do-update! existing-data new-data multi-row-with-ref-spec)))))))

(deftest multi-row-with-ref-add-assignee-test
  (testing "Adding an assignee to a task that didn't have one"
    (let [existing-data {:id 1
                         :name "Project"
                         :tasks [{:id 10
                                  :description "Task 1"
                                  :project_id 1}]}
          new-data (assoc-in existing-data [:tasks 0 :assignee] {:name "New Assignee"})]
      (is (= [[:insert-returning-pk! :user {:name "New Assignee"}]
              [:update! :task 10 {:description "Task 1", :project_id 1, :assignee_id 2}]]
             (with-tracked-operations!
               (spec-update/do-update! existing-data new-data multi-row-with-ref-spec)))))))

(deftest multi-row-with-ref-remove-assignee-test
  (testing "Removing an assignee from a task"
    (let [existing-data {:id 1
                         :name "Project"
                         :tasks [{:id 10
                                  :description "Task 1"
                                  :project_id 1
                                  :assignee_id 100
                                  :assignee {:id 100
                                             :name "User A"}}]}
          new-data (update-in existing-data [:tasks 0] dissoc :assignee)]
      (is (= [[:delete! :user 100]
              [:update! :task 10 {:description "Task 1", :project_id 1, :assignee_id nil}]]
             (with-tracked-operations!
               (spec-update/do-update! existing-data new-data multi-row-with-ref-spec)))))))

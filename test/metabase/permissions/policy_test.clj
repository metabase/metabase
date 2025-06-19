(ns metabase.permissions.policy-test
  (:require
   [clojure.test :refer :all]
   [metabase.permissions.policy :as policy]))

(def sample-permissions-doc
  "Sample permissions document for testing"
  {:dashboards
   {1 {:perms/dashboard-access :read
       :drills true
       :params {:customer [10]}}
    2 {:perms/dashboard-access :read-and-write}
    3 {:perms/dashboard-access :none}}
   :collections
   {1 {:perms/collection-access :read}
    2 {:perms/collection-access :read-and-write}
    3 {:perms/collection-access :none}}
   :databases
   {1 {:tables {10 {:perms/download-results :no
                    :perms/create-queries :no
                    :perms/view-data :unrestricted}
                20 {:perms/download-results :one-million-rows
                    :perms/create-queries :no
                    :perms/view-data :blocked}
                30 {:perms/download-results :ten-thousand-rows
                    :perms/create-queries :query-builder
                    :perms/view-data :unrestricted}}}
    2 {:perms/download-results :one-million-rows
       :perms/create-queries :query-builder-and-native
       :perms/view-data :unrestricted}}})

(deftest test-boolean-literals
  (testing "Boolean literal policies"
    (is (true? (policy/evaluate-policy true sample-permissions-doc {})))
    (is (false? (policy/evaluate-policy false sample-permissions-doc {})))))

(deftest test-or-operation
  (testing ":or operation"
    (is (true? (policy/evaluate-policy [:or true false] sample-permissions-doc {})))
    (is (true? (policy/evaluate-policy [:or false true] sample-permissions-doc {})))
    (is (false? (policy/evaluate-policy [:or false false] sample-permissions-doc {})))
    (is (true? (policy/evaluate-policy [:or true true] sample-permissions-doc {})))))

(deftest test-and-operation
  (testing ":and operation"
    (is (true? (policy/evaluate-policy [:and true true] sample-permissions-doc {})))
    (is (false? (policy/evaluate-policy [:and true false] sample-permissions-doc {})))
    (is (false? (policy/evaluate-policy [:and false true] sample-permissions-doc {})))
    (is (false? (policy/evaluate-policy [:and false false] sample-permissions-doc {})))))

(deftest test-in-operation
  (testing ":in operation with dashboard access"
    (let [dashboard {:id 1 :collection_id 1}]
      (is (true? (policy/evaluate-policy
                  [:in :self.id :dashboards [:more :perms/dashboard-access :read]]
                  sample-permissions-doc
                  dashboard))))

    (let [dashboard {:id 2 :collection_id 1}]
      (is (true? (policy/evaluate-policy
                  [:in :self.id :dashboards [:more :perms/dashboard-access :read]]
                  sample-permissions-doc
                  dashboard))))

    (let [dashboard {:id 3 :collection_id 1}]
      (is (false? (policy/evaluate-policy
                   [:in :self.id :dashboards [:more :perms/dashboard-access :read]]
                   sample-permissions-doc
                   dashboard))))

    (let [dashboard {:id 999 :collection_id 1}]
      (is (nil? (policy/evaluate-policy
                 [:in :self.id :dashboards [:more :perms/dashboard-access :read]]
                 sample-permissions-doc
                 dashboard))))))

(deftest test-more-operation
  (testing ":more operation with various permission levels"
    ;; Test dashboard permissions - need to use :in to set up the resource path
    ;; read-and-write is more permissive than read
    (is (true? (policy/evaluate-policy [:in :self.id :dashboards [:more :perms/dashboard-access :read]]
                                       sample-permissions-doc
                                       {:id 2})))

    ;; read equals read
    (is (true? (policy/evaluate-policy [:in :self.id :dashboards [:more :perms/dashboard-access :read]]
                                       sample-permissions-doc
                                       {:id 1})))

    ;; none is less permissive than read
    (is (false? (policy/evaluate-policy [:in :self.id :dashboards [:more :perms/dashboard-access :read]]
                                        sample-permissions-doc
                                        {:id 3})))))

(deftest test-less-operation
  (testing ":less operation with various permission levels"
    ;; read is less permissive than read-and-write
    (is (true? (policy/evaluate-policy [:in :self.id :dashboards [:less :perms/dashboard-access :read-and-write]]
                                       sample-permissions-doc
                                       {:id 1})))

    ;; read-and-write equals read-and-write
    (is (true? (policy/evaluate-policy [:in :self.id :dashboards [:less :perms/dashboard-access :read-and-write]]
                                       sample-permissions-doc
                                       {:id 2})))

    ;; read-and-write is more permissive than read
    (is (false? (policy/evaluate-policy [:in :self.id :dashboards [:less :perms/dashboard-access :read]]
                                        sample-permissions-doc
                                        {:id 2})))

    ;; none is less permissive than read
    (is (true? (policy/evaluate-policy [:in :self.id :dashboards [:less :perms/dashboard-access :read]]
                                       sample-permissions-doc
                                       {:id 3})))))

(deftest test-default-values
  (testing "Default values when permissions are missing"
    (let [empty-doc {}]
      ;; Should use default value when resource is missing
      (is (false? (policy/evaluate-policy [:in :self.id :dashboards [:more :perms/dashboard-access :read [:default :none]]]
                                          empty-doc
                                          {:id 999})))

      (is (true? (policy/evaluate-policy [:in :self.id :dashboards [:more :perms/dashboard-access :read [:default :read-and-write]]]
                                         empty-doc
                                         {:id 999}))))))

(deftest test-complex-dashboard-policy
  (testing "Complex dashboard policy from docstring example"
    (let [policy [:or
                  [:in :self.id :dashboards [:more :perms/dashboard-access :read]]
                  [:in :self.collection_id :collections [:more :perms/collection-access :read]]]
          dashboard-with-direct-access {:id 1 :collection_id 999}
          dashboard-with-collection-access {:id 999 :collection_id 1}
          dashboard-with-both-access {:id 1 :collection_id 1}
          dashboard-with-no-access {:id 999 :collection_id 999}]

      ;; Dashboard has direct access
      (is (true? (policy/evaluate-policy policy sample-permissions-doc dashboard-with-direct-access)))

      ;; Dashboard has collection access
      (is (true? (policy/evaluate-policy policy sample-permissions-doc dashboard-with-collection-access)))

      ;; Dashboard has both types of access
      (is (true? (policy/evaluate-policy policy sample-permissions-doc dashboard-with-both-access)))

      ;; Dashboard has no access
      (is (false? (policy/evaluate-policy policy sample-permissions-doc dashboard-with-no-access))))))

(deftest test-each-operation
  (testing ":each operation with multiple targets"
    (let [policy [:each :target :self
                  [:in :target.id :collections [:more :perms/collection-access :read]]]
          query-context [{:id 1} {:id 2}]
          mixed-context [{:id 1} {:id 3}]
          no-access-context [{:id 3} {:id 999}]]

      ;; All targets have required access
      (is (true? (policy/evaluate-policy policy sample-permissions-doc query-context)))

      ;; Mixed access - should fail because :each requires ALL to pass
      (is (false? (policy/evaluate-policy policy sample-permissions-doc mixed-context)))

      ;; No targets have access
      (is (false? (policy/evaluate-policy policy sample-permissions-doc no-access-context))))))

(deftest test-database-table-permissions
  (testing "Database and table-level permissions"
    (let [table-policy [:in :self.db :databases
                        [:or [:and [:more :perms/view-data :unrestricted]
                              [:more :perms/create-queries :query-builder]]
                         [:in :self.id :tables [:and [:more :perms/view-data :unrestricted]
                                                [:more :perms/create-queries :query-builder]]]]]
          table-with-db-access {:id 999 :db 2}
          table-with-table-access {:id 30 :db 1}
          table-with-no-access {:id 20 :db 1}]

      ;; Table inherits database-level permissions
      (is (true? (policy/evaluate-policy table-policy sample-permissions-doc table-with-db-access)))

      ;; Table has specific table-level permissions
      (is (true? (policy/evaluate-policy table-policy sample-permissions-doc table-with-table-access)))

      ;; Table has insufficient permissions
      (is (false? (policy/evaluate-policy table-policy sample-permissions-doc table-with-no-access))))))

(deftest test-fn-operation
  (testing ":fn operation with custom functions"
    ;; Define a test function
    (defn test-permission-fn [id threshold]
      (> id threshold))

    (let [policy [:fn `test-permission-fn :self.id 5]
          high-id-model {:id 10}
          low-id-model {:id 3}]

      (is (true? (policy/evaluate-policy policy sample-permissions-doc high-id-model)))
      (is (false? (policy/evaluate-policy policy sample-permissions-doc low-id-model))))))

(deftest test-nested-policies
  (testing "Deeply nested policy combinations"
    (let [complex-policy [:and
                          [:or
                           [:in :self.id :dashboards [:more :perms/dashboard-access :read]]
                           [:in :self.collection_id :collections [:more :perms/collection-access :read]]]
                          [:or
                           [:in :self.collection_id :collections [:more :perms/collection-access :read-and-write]]
                           true]]
          dashboard {:id 1 :collection_id 1}]

      (is (true? (policy/evaluate-policy complex-policy sample-permissions-doc dashboard))))))

(deftest test-path-resolution
  (testing "Path resolution with dotted notation"
    (let [model {:user {:id 123 :name "test"} :collection_id 1}
          policy [:fn `identity :self.user.id]]

      (is (= 123 (policy/evaluate-policy policy sample-permissions-doc model))))))

(deftest test-edge-cases
  (testing "Edge cases and error conditions"
    ;; Nil model instance
    (is (nil? (policy/evaluate-policy [:in :self.id :dashboards true] sample-permissions-doc nil)))

    ;; Missing properties
    (is (nil? (policy/evaluate-policy [:in :self.missing_prop :dashboards true] sample-permissions-doc {})))

    ;; Empty permissions document
    (is (nil? (policy/evaluate-policy [:in :self.id :dashboards [:more :perms/dashboard-access :read]]
                                      {} {:id 1})))

    ;; Literal values pass through
    (is (= "literal" (policy/evaluate-policy "literal" sample-permissions-doc {})))
    (is (= 42 (policy/evaluate-policy 42 sample-permissions-doc {})))))

(deftest test-permission-hierarchies
  (testing "Permission hierarchy ordering"
    ;; Collection access hierarchy: read-and-write > read > none
    (is (true? (policy/evaluate-policy [:in :self.id :collections [:more :perms/collection-access :none]]
                                       sample-permissions-doc
                                       {:id 1}))) ; read > none

    (is (true? (policy/evaluate-policy [:in :self.id :collections [:more :perms/collection-access :read]]
                                       sample-permissions-doc
                                       {:id 2}))) ; read-and-write > read

    (is (false? (policy/evaluate-policy [:in :self.id :collections [:more :perms/collection-access :read-and-write]]
                                        sample-permissions-doc
                                        {:id 1}))) ; read < read-and-write

    ;; Database permissions hierarchy
    (is (true? (policy/evaluate-policy [:in :self.id :databases [:more :perms/view-data :blocked]]
                                       sample-permissions-doc
                                       {:id 2}))) ; unrestricted > blocked

    (is (false? (policy/evaluate-policy [:in :self.id :databases [:in :self.table_id :tables [:more :perms/create-queries :query-builder-and-native]]]
                                        sample-permissions-doc
                                        {:id 1 :table_id 10})))))

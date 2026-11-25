(ns metabase.actions.execution-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase.actions.execution-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase.actions.execution :as actions.execution]
   [metabase.actions.models :as action]
   [metabase.collections.models.collection :as collection]
   [metabase.lib-be.core :as lib-be]
   [metabase.queries.models.query-execution :as query-execution]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.middleware.process-userland-query-test :as process-userland-query-test]
   [metabase.request.core :as request]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(deftest fetch-values-save-execution-info-test
  (testing "fetch values for implicit action will save an execution info"
    (mt/test-helpers-set-global-values!
      (mt/with-actions-enabled
        (let [dataset-query (mt/mbql-query venues {:fields [$id $name]})
              query (assoc
                     dataset-query
                     :parameters [{:id     "metabase.actions.execution/prefetch-parameters-pk"
                                   :target [:dimension
                                            (-> dataset-query
                                                :query
                                                :fields
                                                first)]
                                   :type   :number/=
                                   :value  [1]}]
                     :constraints nil
                     :middleware nil
                     :cache-strategy nil)]
          (mt/with-actions [_                   {:type :model :dataset_query dataset-query}
                            {:keys [action-id]} {:type :implicit :kind "row/update"}]
            (process-userland-query-test/with-query-execution! [qe query]
              (is (= {"id" 1 "name" "Red Medicine"}
                     (actions.execution/fetch-values (action/select-action :id action-id) {"id" 1})))
              (is (=? {:action_id action-id}
                      (qe))))))))))

(deftest implicit-action-prefetch-parameter-type-test
  (testing "implicit action prefetch uses explicit parameter type instead of :id (QUE2-326)"
    (mt/test-helpers-set-global-values!
      (mt/with-actions-enabled
        (mt/with-actions [_                   {:type :model :dataset_query (mt/mbql-query venues {:fields [$id $name]})}
                          {:keys [action-id]} {:type :implicit :kind "row/update"}]
          (let [action                        (action/select-action :id action-id)
                build-implicit-query          #'actions.execution/build-implicit-query
                {:keys [prefetch-parameters]} (build-implicit-query action :model.row/update {"id" 1})]
            (testing "numeric PK → :number/="
              (is (= :number/=
                     (:type (first prefetch-parameters)))))))))))

;;; ------------------------------------------------ Audit trail ---------------------------------------------------

(defn- recorded-template [row]
  (t2/select-one-fn :query :model/Query :query_hash (:hash row)))

(deftest table-action-runs-with-the-fields-it-was-made-with-test
  (testing "an implicit action without a model ignores sensitive fields when it runs, as when it was made"
    (mt/with-temp [:model/Database {db-id :id}       {:engine :h2}
                   :model/Table    {clash-id :id}     {:db_id db-id :name "CLASH"}
                   :model/Field    _                  {:table_id clash-id :name "id" :base_type :type/Integer
                                                       :semantic_type :type/PK}
                   :model/Field    _                  {:table_id clash-id :name "NAME" :base_type :type/Text}
                   :model/Field    _                  {:table_id clash-id :name "name" :base_type :type/Text
                                                       :visibility_type :sensitive}
                   :model/Table    {two-pk-id :id}    {:db_id db-id :name "TWO_PK"}
                   :model/Field    _                  {:table_id two-pk-id :name "id" :base_type :type/Integer
                                                       :semantic_type :type/PK}
                   :model/Field    _                  {:table_id two-pk-id :name "secret" :base_type :type/Integer
                                                       :semantic_type :type/PK :visibility_type :sensitive}]
      (mt/with-model-cleanup [:model/Action]
        (doseq [[description table-id] {"a name that clashes only with a sensitive column" clash-id
                                        "a second, sensitive primary key"                  two-pk-id}]
          (testing description
            (let [action-id            (:id (first (action/create-actions! [{:type :implicit :name description :kind :row/update
                                                                             :table_id table-id}])))
                  build-implicit-query #'actions.execution/build-implicit-query]
              (is (=? {:row-parameters {}}
                      (build-implicit-query (action/select-action :id action-id) :model.row/update {"id" 1}))))))))))

(deftest native-action-audit-trail-test
  (testing "a native query action records one QueryExecution row for the write"
    (mt/test-helpers-set-global-values!
      (mt/with-actions-test-data-and-actions-enabled
        (mt/with-actions [{:keys [action-id]} {:type :query}]
          (mt/with-test-user :crowberto
            (let [action (action/select-action :id action-id)
                  since  (mt/latest-query-execution-id)
                  result (actions.execution/execute-action! action {"id" 1 "name" "Bird"})
                  rows   (mt/action-executions since)]
              (is (= {:rows-affected 1} result))
              (is (= 1 (count rows)))
              (is (=? {:context      :action-execute
                       :action_id    action-id
                       :executor_id  (mt/user->id :crowberto)
                       :native       true
                       :result_rows  1
                       :error        nil
                       :cache_hit    false
                       :dashboard_id nil
                       :database_id  (mt/id)}
                      (first rows)))
              (testing "the hash covers the template, not the values"
                (is (= (seq (lib-be/query-hash (dissoc (:dataset_query action) :parameters :info)))
                       (seq (:hash (first rows))))))
              (testing "the query row holds the template, without the values"
                (let [template (recorded-template (first rows))]
                  (is (= (get-in action [:dataset_query :native :query])
                         (get-in template [:native :query])))
                  (is (not (contains? template :parameters)))))
              (testing "a second execution with different values reuses the query row"
                (let [since (mt/latest-query-execution-id)
                      _     (actions.execution/execute-action! action {"id" 1 "name" "Fish"})
                      row   (first (mt/action-executions since))]
                  (is (= (seq (:hash (first rows))) (seq (:hash row))))
                  (is (= 1 (t2/count :model/Query :query_hash (:hash row)))))))))))))

(deftest native-action-failure-audit-trail-test
  (testing "a failed native action records the driver's error, and the exception is unchanged"
    (mt/test-helpers-set-global-values!
      (mt/with-actions-test-data-and-actions-enabled
        (mt/with-actions [{:keys [action-id]} {:type          :query
                                               :parameters    []
                                               :dataset_query (mt/native-query
                                                               {:query "UPDATE categories SET name = 1/0 WHERE id = 1"})}]
          (mt/with-test-user :crowberto
            (let [action (action/select-action :id action-id)
                  since  (mt/latest-query-execution-id)]
              (is (thrown-with-msg? ExceptionInfo #"Error executing Action"
                                    (actions.execution/execute-action! action {})))
              (let [row (first (mt/action-executions since))]
                (is (some? row))
                (is (some? (:error row)))
                (is (not (re-find #"Error executing Action" (:error row)))
                    "the row holds the driver message, not the wrapper added after the audited span")
                (is (= 0 (:result_rows row)))))))))))

(deftest permission-denial-audit-trail-test
  (testing "a permission denial is audited, and still raises a 403"
    (mt/test-helpers-set-global-values!
      (mt/with-actions-test-data-and-actions-enabled
        (mt/with-actions [_ {:type          :model
                             :dataset_query (mt/mbql-query categories)
                             :collection_id (:id (collection/user->personal-collection (mt/user->id :crowberto)))}
                          {query-action-id :action-id}    {:type :query}
                          {implicit-action-id :action-id} {:type :implicit :kind "row/update"}]
          (mt/with-test-user :rasta
            (testing "native action"
              (let [since (mt/latest-query-execution-id)]
                (is (thrown-with-msg? ExceptionInfo #"permissions"
                                      (actions.execution/execute-action! (action/select-action :id query-action-id)
                                                                         {"id" 1 "name" "Bird"})))
                (is (=? {:context :action-execute, :error some?}
                        (first (mt/action-executions since))))))
            ;; the permission check runs inside the audited span, so a denial leaves a row too
            (testing "implicit action"
              (let [since (mt/latest-query-execution-id)]
                (is (thrown-with-msg? ExceptionInfo #"permissions"
                                      (actions.execution/execute-action! (action/select-action :id implicit-action-id)
                                                                         {"id" 1 "name" "Bird"})))
                (is (=? {:context :action-execute, :error some?, :native false}
                        (first (mt/action-executions since))))))))))))

(deftest dashcard-and-public-audit-trail-test
  (mt/test-helpers-set-global-values!
    (mt/with-actions-test-data-and-actions-enabled
      (mt/with-actions [{model-id :id} {:type :model :dataset_query (mt/mbql-query categories)}
                        {:keys [action-id]} {:type :query}]
        (mt/with-temp [:model/Dashboard     {dashboard-id :id} {}
                       :model/DashboardCard {dashcard-id :id}  {:dashboard_id dashboard-id
                                                                :action_id    action-id
                                                                :card_id      model-id}]
          (mt/with-test-user :crowberto
            (testing "a model-page execution leaves dashboard_id nil"
              (let [since (mt/latest-query-execution-id)]
                (actions.execution/execute-action! (action/select-action :id action-id) {"id" 1 "name" "Bird"})
                (is (=? {:dashboard_id nil, :context :action-execute}
                        (first (mt/action-executions since))))))
            (testing "a dashcard execution sets dashboard_id"
              (let [since (mt/latest-query-execution-id)]
                (actions.execution/execute-dashcard! dashboard-id dashcard-id {"id" 1 "name" "Bird"})
                (is (=? {:dashboard_id dashboard-id, :context :action-execute}
                        (first (mt/action-executions since))))))
            (testing "a public execution has no executor and its own context"
              (let [since (mt/latest-query-execution-id)]
                (actions.execution/execute-action! (action/select-action :id action-id) {"id" 1 "name" "Bird"}
                                                   {:context :public-action-execute})
                (is (=? {:context :public-action-execute}
                        (first (mt/action-executions since))))))
            (testing "a public dashcard execution carries the dashboard and the public context"
              (let [since (mt/latest-query-execution-id)]
                (actions.execution/execute-dashcard! dashboard-id dashcard-id {"id" 1 "name" "Bird"}
                                                     {:context :public-action-execute})
                (is (=? {:context :public-action-execute, :dashboard_id dashboard-id}
                        (first (mt/action-executions since))))))))))))

(deftest public-execution-has-no-executor-test
  ;; the public endpoints wrap execution in `request/as-admin`, which grants perms but leaves the user nil
  (testing "a public form execution records no executor"
    (mt/test-helpers-set-global-values!
      (mt/with-actions-test-data-and-actions-enabled
        (mt/with-actions [{:keys [action-id]} {:type :query}]
          (let [action (action/select-action :id action-id)
                since  (mt/latest-query-execution-id)]
            (request/as-admin
              (actions.execution/execute-action! action {"id" 1 "name" "Bird"}
                                                 {:context :public-action-execute}))
            (is (=? {:context :public-action-execute, :executor_id nil}
                    (first (mt/action-executions since))))))))))

(deftest public-implicit-execution-skips-impersonation-lookup-test
  ;; the OSS `impersonation-enforced-for-db?` throws without a user, so the audit must not ask it on a public form
  (testing "a public implicit execution records is_impersonated false and logs no lookup error"
    (mt/test-helpers-set-global-values!
      (mt/with-premium-features #{}
        (mt/with-actions-test-data-and-actions-enabled
          (mt/with-actions [{:keys [action-id]} {:type :implicit :kind "row/update"}]
            (let [action (action/select-action :id action-id)
                  since  (mt/latest-query-execution-id)]
              (mt/with-log-messages-for-level [messages [metabase.actions.audit :warn]]
                (request/as-admin
                  (actions.execution/execute-action! action {"id" 1 "name" "Bird"}
                                                     {:context :public-action-execute}))
                (is (=? {:context :public-action-execute, :executor_id nil, :is_impersonated false}
                        (first (mt/action-executions since))))
                (is (empty? (messages)))))))))))

(deftest parameters-are-pii-gated-test
  (mt/test-helpers-set-global-values!
    (mt/with-actions-test-data-and-actions-enabled
      (mt/with-actions [{:keys [action-id]} {:type :query}]
        (mt/with-test-user :crowberto
          (let [action (action/select-action :id action-id)]
            (testing "input values are not recorded by default"
              (let [since (mt/latest-query-execution-id)]
                (actions.execution/execute-action! action {"id" 1 "name" "Bird"})
                (is (=? {:parameterized true, :parameters nil}
                        (first (mt/action-executions since))))))
            (testing "input values are recorded once PII retention is on"
              (mt/with-premium-features #{:audit-app}
                (mt/with-temporary-setting-values [analytics-pii-retention-enabled true]
                  (let [since (mt/latest-query-execution-id)]
                    (actions.execution/execute-action! action {"id" 1 "name" "Bird"})
                    (let [row (first (mt/action-executions since))]
                      (is (some? (:parameters row)))
                      (is (= #{1 "Bird"}
                             (into #{} (map :value) (json/decode+kw (:parameters row))))))))))))))))

(deftest audit-write-failure-does-not-fail-the-action-test
  (testing "an audit insert that blows up after the warehouse write is logged, not thrown"
    (mt/test-helpers-set-global-values!
      (mt/with-actions-test-data-and-actions-enabled
        (mt/with-actions [{:keys [action-id]} {:type :query}]
          (mt/with-test-user :crowberto
            (let [action (action/select-action :id action-id)
                  since  (mt/latest-query-execution-id)]
              (let [attempts (atom 0)]
                (mt/with-dynamic-fn-redefs [query-execution/create-query-executions!
                                            (fn [_rows]
                                              (swap! attempts inc)
                                              (throw (ex-info "app db is down" {})))]
                  (is (= {:rows-affected 1}
                         (actions.execution/execute-action! action {"id" 1 "name" "Bird"}))))
                (is (= 1 @attempts)))
              (is (empty? (mt/action-executions since))))))))))

(deftest remap-parameter-keys-test
  (testing "remap-parameter-keys translates incoming parameter keys to the destination parameter's :id"
    (let [action {:parameters [{:id "d800e41d-edde-49cb-b63b-2386aba34334"
                                :slug "id"
                                :name "ID"}
                               {:id "58c9e1ca-2f3a-4e57-96d9-2507c21a9a4b"
                                :slug "discount"
                                :name "Discount"}]}]
      (testing "slug-keyed input is remapped to :id"
        (is (= {"d800e41d-edde-49cb-b63b-2386aba34334" 1
                "58c9e1ca-2f3a-4e57-96d9-2507c21a9a4b" 0.1}
               (actions.execution/remap-parameter-keys action
                                                       {"id" 1 "discount" 0.1}))))
      (testing "already-:id-keyed input is passed through unchanged"
        (is (= {"d800e41d-edde-49cb-b63b-2386aba34334" 1
                "58c9e1ca-2f3a-4e57-96d9-2507c21a9a4b" 0.1}
               (actions.execution/remap-parameter-keys
                action
                {"d800e41d-edde-49cb-b63b-2386aba34334" 1
                 "58c9e1ca-2f3a-4e57-96d9-2507c21a9a4b" 0.1}))))
      (testing "display-name keys (`:name`) are NOT accepted — they pass through unchanged"
        (is (= {"ID" 1 "Discount" 0.1}
               (actions.execution/remap-parameter-keys action
                                                       {"ID" 1 "Discount" 0.1}))))
      (testing "unknown keys pass through unchanged so downstream validation still fires"
        (is (= {"d800e41d-edde-49cb-b63b-2386aba34334" 1
                "bogus" 42}
               (actions.execution/remap-parameter-keys action
                                                       {"id" 1 "bogus" 42}))))
      (testing "a mix of :id and :slug keys resolve together"
        (is (= {"d800e41d-edde-49cb-b63b-2386aba34334" 1
                "58c9e1ca-2f3a-4e57-96d9-2507c21a9a4b" 0.1}
               (actions.execution/remap-parameter-keys
                action
                {"d800e41d-edde-49cb-b63b-2386aba34334" 1
                 "discount" 0.1}))))
      (testing "empty parameters map → empty result"
        (is (= {}
               (actions.execution/remap-parameter-keys action {}))))
      (testing "implicit-action style (no :slug) — :id-keyed input still passes through"
        (let [implicit-action {:parameters [{:id "name" :name "Name"}
                                            {:id "email" :name "Email"}]}]
          (is (= {"name" "Foo" "email" "foo@bar.com"}
                 (actions.execution/remap-parameter-keys
                  implicit-action
                  {"name" "Foo" "email" "foo@bar.com"}))))))))

(deftest parameter-values-test
  (let [action {:id                     1
                :name                   "Refund"
                :type                   :query
                :parameters             [{:id "p-order" :slug "order_id" :name "Order ID" :type :number}
                                         {:id "p-status" :slug "status" :name "Status" :type :text}
                                         {:id "p-note" :slug "note" :name "Note" :type :text}]
                :visualization_settings {:fields {"p-status" {:id "p-status" :hidden true :defaultValue "refunded"}
                                                  "p-note"   {:id "p-note" :defaultValue "none"}}}}
        refusal (fn [request-parameters]
                  (try (actions.execution/parameter-values action request-parameters)
                       nil
                       (catch ExceptionInfo e (select-keys (ex-data e) [:status-code]))))]
    (testing "a value keyed by slug goes to the parameter's id, and a missing parameter takes its default"
      (is (= {"p-order" 1 "p-status" "refunded" "p-note" "none"}
             (actions.execution/parameter-values action {"order_id" 1}))))
    (testing "a value given for a parameter with a default replaces the default"
      (is (= {"p-order" 1 "p-status" "refunded" "p-note" "late"}
             (actions.execution/parameter-values action {"p-order" 1 "note" "late"}))))
    (testing "a parameter with no value and no default has none"
      (is (= {"p-status" "refunded" "p-note" "none"}
             (actions.execution/parameter-values action {}))))
    (testing "a value for a hidden parameter is refused"
      (is (= {:status-code 400} (refusal {"order_id" 1 "status" "paid"}))))
    (testing "a value for no parameter is refused"
      (is (= {:status-code 400} (refusal {"order_id" 1 "bogus" 2}))))))

(deftest query-with-parameter-values-test
  (mt/test-driver :h2
    (mt/with-actions-enabled
      (mt/with-actions [_                   {:type :model :dataset_query (mt/mbql-query categories)}
                        {:keys [action-id]} {}]
        (testing "the action's query, given parameter values, compiles to the SQL a run of the action executes"
          (is (=? {:query  #"(?s)UPDATE categories.*concat\(\?, ' ', 'Sh', 'op'\).*WHERE id = 1"
                   :params ["Toy"]}
                  (qp.compile/compile
                   (actions.execution/query-with-parameter-values (action/select-action :id action-id)
                                                                  {"id" 1 "name" "Toy"})))))))))

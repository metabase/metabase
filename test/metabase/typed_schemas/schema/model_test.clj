(ns metabase.typed-schemas.schema.model-test
  (:require
   [clojure.test :refer :all]
   [metabase.actions.core :as actions]
   [metabase.test :as mt]
   [metabase.typed-schemas.schema.common :as schema.common]
   [metabase.typed-schemas.schema.model :as schema.model]))

(comment mt/keep-me)

(deftest model-schema-includes-actions-test
  (mt/with-dynamic-fn-redefs [schema.model/model-action-schemas
                              (constantly [{:kind "action", :key "create", :id 5}])]
    (is (= {:key              "ordersModel"
            :keyDisambiguator 42
            :actions          {"create" {:kind "action", :key "create", :id 5}}}
           (schema.model/model-schema
            {:id   42
             :name "Orders model"})))))

(deftest model-schemas-includes-only-actionable-models-test
  (with-redefs [schema.common/select-schema-cards
                (constantly [{:id 42 :name "Model 42"}
                             {:id 43 :name "Model 43"}])
                schema.model/action-rows
                (constantly [{:id 5 :model_id 42 :name "Create" :type :query}])
                actions/select-actions-non-http-for-models
                (constantly [{:id         5
                              :model_id   42
                              :name       "Create"
                              :type       :query
                              :parameters []}])]
    ;; only model 42 has an action, so model 43 is omitted
    (is (= ["model42"]
           (map :key (:models (schema.model/model-schemas #{1} nil)))))))

; Ensures we are not doing N+1 queries for action rows and details
(deftest model-schemas-bulk-loads-actions-test
  (let [models               [{:id 42 :name "Model 42"}
                              {:id 43 :name "Model 43"}]
        action-rows-calls    (atom [])
        action-details-calls (atom [])]
    (with-redefs [schema.common/select-schema-cards (constantly models)
                  schema.model/action-rows (fn [model-ids]
                                             (swap! action-rows-calls conj model-ids)
                                             [])
                  actions/select-actions-non-http-for-models (fn [known-models model-ids]
                                                               (swap! action-details-calls conj [known-models model-ids])
                                                               [])]
      (is (= {:models [] :errors []} (schema.model/model-schemas #{1} nil)))
      (is (= [#{42 43}] @action-rows-calls))
      (is (= [[models #{42 43}]]
             @action-details-calls)))))

(deftest model-schemas-collects-broken-model-errors-test
  (testing "a broken model becomes an :errors entry while healthy models still build"
    (with-redefs [schema.common/select-schema-cards
                  (constantly [{:id 42 :name "Model 42"}
                               {:id 43 :name "Broken model"}])
                  schema.model/action-rows
                  (constantly [{:id 5 :model_id 42 :name "Create" :type :query}
                               ;; model 43's action row resolves to no action details
                               {:id 6 :model_id 43 :name "Broken action" :type :broken}])
                  actions/select-actions-non-http-for-models
                  (constantly [{:id         5
                                :model_id   42
                                :name       "Create"
                                :type       :query
                                :parameters []}])]
      (let [{:keys [models errors]} (schema.model/model-schemas #{1} nil)]
        (is (= ["model42"] (map :key models)))
        (is (=? [{:type      "modelError"
                  :modelId   43
                  :modelName "Broken model"
                  :message   #".*Broken model.*could not be resolved.*"}]
                errors))))))

(deftest model-schemas-falls-back-when-bulk-lookup-fails-test
  (testing "a broken model poisoning the bulk action lookup does not hide other models"
    (with-redefs [schema.common/select-schema-cards
                  (constantly [{:id 42 :name "Model 42"}
                               {:id 43 :name "Broken model"}])
                  ;; bulk lookup blows up for the whole batch
                  actions/select-actions-non-http-for-models
                  (fn [& _] (throw (ex-info "bulk lookup exploded" {})))
                  ;; per-model fallback: model 42 resolves, model 43 still fails
                  schema.model/action-rows
                  (fn [model-ids]
                    (if (contains? model-ids 42)
                      [{:id 5 :model_id 42 :name "Create" :type :query}]
                      []))
                  actions/select-actions
                  (fn [_ & {:keys [model_id]}]
                    (if (= model_id 42)
                      [{:id 5 :model_id 42 :name "Create" :type :query :parameters []}]
                      (throw (ex-info "action lookup failed" {:status-code 500}))))]
      (let [{:keys [models errors]} (schema.model/model-schemas #{1} nil)]
        (is (= ["model42"] (map :key models)))
        (is (=? [{:type      "modelError"
                  :modelId   43
                  :modelName "Broken model"
                  :message   #".*Broken model.*action lookup failed.*"}]
                errors))))))

(deftest model-schemas-does-not-swallow-interruption-test
  (testing "an interruption while bulk-resolving actions propagates instead of collecting an error"
    (with-redefs [schema.common/select-schema-cards
                  (constantly [{:id 42 :name "Model 42"}])
                  schema.model/action-rows (constantly [])
                  actions/select-actions-non-http-for-models
                  (fn [& _] (throw (InterruptedException. "cancelled")))]
      (let [thrown (is (thrown? clojure.lang.ExceptionInfo
                                (schema.model/model-schemas #{1} nil)))]
        (is (instance? InterruptedException (ex-cause thrown))))))
  (testing "an interruption while building one model's schema propagates instead of collecting an error"
    (with-redefs [schema.common/select-schema-cards
                  (constantly [{:id 42 :name "Model 42"}])
                  schema.model/action-rows (constantly [])
                  actions/select-actions-non-http-for-models (constantly [])
                  schema.model/model-action-schemas
                  (fn [& _] (throw (InterruptedException. "cancelled")))]
      (is (thrown? InterruptedException
                   (schema.model/model-schemas #{1} nil))))))

(deftest model-schema-surfaces-action-selection-errors-test
  (with-redefs [schema.model/action-rows (constantly [])
                actions/select-actions (fn [& _]
                                         (throw (ex-info "action lookup failed"
                                                         {:status-code 500})))]
    (let [exception (is (thrown? clojure.lang.ExceptionInfo
                                 (schema.model/model-schema {:id   100
                                                             :name "Broken model"})))]
      (is (= "Failed to build action schemas for model \"Broken model\" (card 100): action lookup failed"
             (ex-message exception)))
      (is (=? {:model-id      100
               :model-name    "Broken model"
               :status-code   500
               :cause-message "action lookup failed"}
              (ex-data exception))))))

(deftest model-schema-surfaces-action-rendering-errors-test
  (with-redefs [actions/select-actions (constantly [{:id   200
                                                     :name "Broken action"
                                                     :type :query}])
                schema.model/action-rows (constantly [{:id   200
                                                       :name "Broken action"
                                                       :type :query}])
                schema.model/action-detail-schema (fn [& _]
                                                    (throw (ex-info "action parameters are invalid"
                                                                    {:status-code 500})))]
    (let [exception (is (thrown? clojure.lang.ExceptionInfo
                                 (schema.model/model-schema {:id   100
                                                             :name "Broken model"})))]
      (is (= "Failed to build action schema for action \"Broken action\" (action 200, type query) on model \"Broken model\" (card 100): action parameters are invalid"
             (ex-message exception)))
      (is (=? {:model-id      100
               :model-name    "Broken model"
               :action-id     200
               :action-name   "Broken action"
               :action-type   :query
               :status-code   500
               :cause-message "action parameters are invalid"}
              (ex-data exception))))))

(deftest model-schema-surfaces-unresolved-action-row-errors-test
  (with-redefs [schema.model/action-rows (constantly [{:id   200
                                                       :name "Broken action"
                                                       :type :broken}])
                actions/select-actions (constantly [])]
    (let [exception (is (thrown? clojure.lang.ExceptionInfo
                                 (schema.model/model-schema {:id   100
                                                             :name "Broken model"})))]
      (is (= "Failed to build action schemas for model \"Broken model\" (card 100): action rows could not be resolved: Broken action (action 200, type broken)"
             (ex-message exception)))
      (is (=? {:model-id               100
               :model-name             "Broken model"
               :unresolved-action-rows [{:id 200, :name "Broken action", :type :broken}]}
              (ex-data exception))))))

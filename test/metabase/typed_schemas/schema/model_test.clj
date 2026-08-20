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
                actions/select-actions
                (constantly [{:id         5
                              :model_id   42
                              :name       "Create"
                              :type       :query
                              :parameters []}])]
    ;; only model 42 has an action, so model 43 is omitted
    (is (= ["model42"]
           (map :key (schema.model/model-schemas #{1} nil))))))

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
                  actions/select-actions (fn [known-models & options]
                                           (swap! action-details-calls conj [known-models options])
                                           [])]
      (is (= [] (vec (schema.model/model-schemas #{1} nil))))
      (is (= [#{42 43}] @action-rows-calls))
      (is (= [[models [:model_id [:in #{42 43}]
                       :archived false
                       :type [:not= "http"]]]]
             @action-details-calls)))))

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

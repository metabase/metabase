(ns metabase-enterprise.data-apps.generate.schemas.action-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.generate.schemas.action :as schemas.action]
   [metabase.actions.core :as actions]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]))

(defn- standalone-action-schema
  "The schema entry for a model-less query action created from `action` and `dataset-query`."
  [action dataset-query]
  (mt/with-temp [:model/Action      {action-id :id} (merge {:type :query, :name "Update bird"} action)
                 :model/QueryAction _ {:action_id action-id, :dataset_query dataset-query}]
    (schemas.action/action-schema (actions/select-action :id action-id))))

(deftest action-schema-types-a-parameter-from-its-template-tag-test
  (testing ":category has no JS type of its own, so the persisted template tag's type decides it"
    (is (=? {:kind       "action"
             :key        "updateBird"
             :type       "query"
             :parameters [{:slug "name", :displayName "Name", :jsType "string"}]}
            (standalone-action-schema
             {:parameters [{:id "name", :name "Name", :type :category, :target [:variable [:template-tag "name"]]}]}
             (lib/native-query (mt/metadata-provider) "UPDATE birds SET name = {{name}}"))))))

(deftest action-schema-resolves-field-filter-widget-type-test
  (testing "a field filter's value type comes from its widget type, through a :dimension parameter target"
    (let [mp (mt/metadata-provider)]
      (is (=? {:parameters [{:slug "created_at", :displayName "Created At", :jsType "Date"}]}
              (standalone-action-schema
               {:parameters [{:id     "created_at"
                              :name   "Created At"
                              :type   :category
                              :target [:dimension [:template-tag "created_at"]]}]}
               (-> (lib/native-query mp "UPDATE birds SET name = 'x' WHERE {{created_at}}")
                   (lib/with-template-tags
                     {"created_at" {:name         "created_at"
                                    :display-name "Created At"
                                    :type         :dimension
                                    :widget-type  :date/single
                                    :dimension    (lib/ref (lib.metadata/field mp (mt/id :categories :name)))}}))))))))

(deftest action-schema-tolerates-an-empty-query-test
  (testing "an action whose stored query degraded to {} still builds, typing parameters from their own types"
    (is (=? {:parameters [{:slug "name", :displayName "Name", :jsType "string"}]}
            (schemas.action/action-schema {:id 7, :name "Update bird", :dataset_query {}
                                           :parameters [{:id "name", :name "Name", :type :text}]})))))

(deftest action-schema-leaves-out-hidden-parameters-test
  (testing "a parameter the action's form hides is left out, since execute refuses a value for it"
    (is (=? {:parameters [{:slug "name"}]}
            (schemas.action/action-schema
             {:id                     7
              :name                   "Update bird"
              :dataset_query          {}
              :parameters             [{:id "name", :name "Name", :type :text}
                                       {:id "updated_by", :name "Updated by", :type :text, :required true}]
              :visualization_settings {:fields {"updated_by" {:id "updated_by", :hidden true}}}})))
    (is (= ["name"]
           (map :slug (:parameters (schemas.action/action-schema
                                    {:id 7, :name "Update bird", :dataset_query {}
                                     :parameters [{:id "name", :type :text} {:id "updated_by", :type :text}]
                                     :visualization_settings {:fields {"updated_by" {:id "updated_by", :hidden true}}}})))))))

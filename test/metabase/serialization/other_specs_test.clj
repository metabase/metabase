(ns metabase.serialization.other-specs-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.serialization.core :as serialization]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- extract-one [model-name entity]
  (let [[x] (into [] (serialization/export model-name [entity]))]
    (when (instance? Throwable x)
      (throw x))
    x))

(deftest action-round-trip-test
  (testing "a query Action exports its query child, and re-imports it over itself"
    (mt/with-temp [:model/Card        {model-id :id} {:type :model :dataset_query (lib/query (mt/metadata-provider) (lib.metadata/table (mt/metadata-provider) (mt/id :venues)))}
                   :model/Action      action         {:type :query :model_id model-id :name "action"}
                   :model/QueryAction _              {:action_id     (:id action)
                                                      :database_id   (mt/id)
                                                      :dataset_query {:database (mt/id)
                                                                      :type     :native
                                                                      :native   {:query "SELECT 1"}}}]
      (let [exported (extract-one :model/Action (t2/select-one :model/Action :id (:id action)))
            db-name  (t2/select-one-fn :name :model/Database :id (mt/id))]
        (is (=? {:type  :query
                 :query [{:database_id db-name :dataset_query {:database db-name}}]}
                exported))
        (t2/delete! :model/QueryAction :action_id (:id action))
        (serialization/load :model/Action [exported])
        (is (=? {:database_id (mt/id)} (t2/select-one :model/QueryAction :action_id (:id action))))))))

(deftest transform-round-trip-test
  (testing "a Transform exports its source query and target with references, and imports them back"
    (mt/with-temp [:model/Transform transform {:name   "transform"
                                               :source {:type  :query
                                                        :query (lib/native-query (mt/metadata-provider) "SELECT 1")}
                                               :target {:type "table" :schema "PUBLIC" :name "serdes_target"
                                                        :database (mt/id)}}]
      (let [exported (extract-one :model/Transform (t2/select-one :model/Transform :id (:id transform)))
            db-name  (t2/select-one-fn :name :model/Database :id (mt/id))
            [row]    (serialization/import :model/Transform [exported])]
        (is (=? {:source {:query {:database db-name}}
                 :target {:database db-name :name "serdes_target"}}
                exported))
        (is (=? {:source {:query {:database (mt/id)}}
                 :target {:database (mt/id)}}
                row))))))

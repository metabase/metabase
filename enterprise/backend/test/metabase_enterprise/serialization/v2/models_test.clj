(ns metabase-enterprise.serialization.v2.models-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.impersonation.models]
   [metabase-enterprise.serialization.v2.models :as serdes.models]
   [metabase.app-db.core :as mdb]
   [metabase.models.resolution :as models.resolution]
   [metabase.serialization.core :as serialization]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(comment
  metabase-enterprise.impersonation.models/keep-me)

(use-fixtures :once
  (fixtures/initialize :db)
  (fn [thunk]
    (doseq [model (keys models.resolution/model->namespace)]
      (t2/resolve-model model))
    (thunk)))

(deftest ^:parallel every-model-is-supported-test
  (testing "Serialization support\n"
    (testing "We know about every model"
      (let [known-models (set (concat serdes.models/exported-models
                                      serdes.models/inlined-models
                                      serdes.models/excluded-models))]
        (is (= known-models
               (set (keys models.resolution/model->namespace))))))))

(deftest ^:parallel exported-models-have-specs-test
  (testing "every exported model has serialization spec"
    (doseq [model serdes.models/exported-models]
      (testing model
        (is (some? (serialization/spec model)))))))

(deftest ^:parallel timestamps-are-skipped-test
  (testing "No serialized model exports or loads created_at or updated_at, so entity serializes same way on every
           instance"
    (doseq [m      (-> (methods serialization/spec) (dissoc :default) keys)
            :let   [{:keys [copy skip transform]} (serialization/spec m)]
            column [:created_at :updated_at]]
      (testing (format "%s.%s" m (name column))
        (is (not (some #{column} copy)))
        (is (not (some #{column} skip)) "always skipped, so leave it out of :skip")
        (is (not (contains? transform column)))))))

(defn- entity-id-collation
  "The collation of `table`'s entity_id column in the schema the `schema-fn` SQL function names."
  [table schema-fn]
  (first (vals (t2/query-one {:select [:collation_name]
                              :from   [:information_schema.columns]
                              :where  [:and
                                       [:= :table_schema [schema-fn]]
                                       [:= :table_name table]
                                       [:= :column_name "entity_id"]]}))))

(deftest entity-id-binary-collation-test
  (testing "entity_id columns compare byte by byte, so every app DB orders exported entities, and names same-named
           files, the same way"
    (when-let [[expected schema-fn] (case (mdb/db-type)
                                      :postgres ["C" :current_schema]
                                      :mysql    ["utf8mb4_bin" :database]
                                      nil)]
      (doseq [model (keys models.resolution/model->namespace)
              :when (isa? model :hook/entity-id)
              :let  [table (name (t2/table-name model))]]
        (testing table
          (is (= expected (entity-id-collation table schema-fn))
              (str "Create the entity_id column with type ${entity_id.type}, and re-state that type in any "
                   "modifyDataType or addNotNullConstraint on it")))))))

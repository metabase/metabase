(ns metabase-enterprise.representations.export-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.representations.core :as rep]
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.yaml :as yaml]
   [metabase.api.common :as api]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest representation-type-test
  (are [expected card-selector] (= expected (export/representation-type card-selector))
    :question   (t2/select-one :model/Card :type :question)
    :metric     (t2/select-one :model/Card :type :metric)
    :model      (t2/select-one :model/Card :type :model)
    :transform  (mt/with-temp [:model/Transform transform {}]
                  transform)
    :snippet    (mt/with-temp [:model/NativeQuerySnippet snippet {}]
                  snippet)
    :database   (t2/select-one :model/Database)
    :collection (t2/select-one :model/Collection)))

(deftest representation-type-all-entities
  (doseq [model [:model/Card :model/Database :model/Transform :model/Collection :model/NativeQuerySnippet]
          entity (t2/select model)]
    (is (export/representation-type entity))))

(deftest export-entity-all-entities
  (doseq [model [:model/Card :model/Database :model/Transform :model/Collection :model/NativeQuerySnippet]
          entity (t2/select model)]
    (mt/with-test-user :crowberto
      (is (export/export-entity entity)))))

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

(deftest export-entity-all-entities
  (doseq [model [:model/Card :model/Database :model/Transform :model/Collection :model/NativeQuerySnippet]
          entity (t2/select model)]
    (mt/with-test-user :crowberto
      (is (export/export-entity entity)))))

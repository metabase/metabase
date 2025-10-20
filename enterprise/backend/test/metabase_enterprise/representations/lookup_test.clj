(ns metabase-enterprise.representations.lookup-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.representations.core :as rep]
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.lookup :as lookup]
   [metabase-enterprise.representations.yaml :as yaml]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(deftest lookup-by-id-test
  (doseq [model [:model/Card
                 :model/Database
                 :model/Transform
                 :model/Collection
                 :model/NativeQuerySnippet]
          entity (t2/select model)]
    (let [id (:id entity)
          rep-type (export/representation-type entity)]
      (is (= id (lookup/lookup-by-id rep-type id))))))

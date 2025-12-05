(ns metabase-enterprise.representations.import-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.import :as import]
   [metabase-enterprise.representations.v0.common-test :as ct]
   [metabase-enterprise.representations.yaml :as rep-yaml]
   [metabase.collections.models.collection :as coll]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(defn- through-yaml [representation]
  (-> representation
      rep-yaml/generate-string
      rep-yaml/parse-string))

(deftest export-insert-all-entities
  (doseq [model [:model/Card :model/Transform :model/Collection :model/NativeQuerySnippet]
          entity (t2/select model)]
    (mt/with-test-user :crowberto
      (let [rep (export/export-entity entity)
            rep (through-yaml rep)
            instance (import/insert! rep (ct/->ParseRefEntityIndex))]
        (try
          (let [rep2 (export/export-entity instance)
                rep2 (through-yaml rep2)]
            (is (=? (dissoc rep  :name :query)
                    (dissoc rep2 :name :query))))
          (finally
            (t2/delete! model (:id instance))))))))

(deftest export-update-all-entities
  (doseq [model [:model/Card :model/Transform :model/Collection :model/NativeQuerySnippet]
          entity (t2/select model)]
    (when-not (and (= model :model/Collection)
                   (coll/is-trash? entity))
      (mt/with-test-user :crowberto
        (let [rep (export/export-entity entity)
              rep (through-yaml rep)
              instance (import/update! rep (:id entity) (ct/->ParseRefEntityIndex))
              rep2 (export/export-entity instance)
              rep2 (through-yaml rep2)]
          (is (=? (dissoc rep  :name :query)
                  (dissoc rep2 :name :query))))))))

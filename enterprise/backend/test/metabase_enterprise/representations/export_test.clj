(ns metabase-enterprise.representations.export-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest export-entity-all-entities
  (doseq [model [:model/Card :model/Database :model/Transform :model/Collection :model/NativeQuerySnippet]
          entity (t2/select model)]
    (mt/with-test-user :crowberto
      (is (export/export-entity entity)))))

(deftest rename-refs-empty
  (is (= [] (export/rename-refs []
                                export/ref-from-name
                                export/standard-ref-strategies
                                export/add-sequence-number))))

(deftest rename-refs-one
  (is (= [{:name "xyz"}]
         (export/rename-refs [{:name "abc"}]
                             (fn [reps] (map #(assoc % ::export/proposed-ref "xyz") reps))
                             []
                             export/add-sequence-number))))

(defn- unique-names?
  [representations]
  (= (count representations)
     (count (into #{} (map :name) representations))))

(deftest hard-one
  (is (unique-names? (export/rename-refs [{:name "1" :display_name "b-question-1" :type :question}
                                          {:name "2" :display_name "b" :type :question}
                                          {:name "3" :display_name "b" :type :question}]
                                         export/ref-from-name
                                         export/standard-ref-strategies
                                         export/add-sequence-number))))

(deftest hard-one
  (let [reps [{:name "1" :display_name "b" :type :question :database "ref:2"}
              {:name "2" :display_name "b" :type :database}]
        reps' (export/rename-refs reps
                                  export/ref-from-name
                                  export/standard-ref-strategies
                                  export/add-sequence-number)]
    (is (= (->> reps'
                (filter #(= :question (:type %)))
                :database
                v0-common/unref)
           (->> reps'
                (filter #(= :database (:type %)))
                :name)))))

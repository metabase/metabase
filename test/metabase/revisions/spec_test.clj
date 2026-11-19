(ns metabase.revisions.spec-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.models.resolution :as models.resolution]
   [metabase.models.spec-test-util :as spec-test-util]
   [metabase.revisions.spec :as revisions.spec]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(defn- revisioned-models!
  "The revisioned models of Metabase, once all of them have loaded."
  []
  (spec-test-util/load-models!)
  (filter models.resolution/model->namespace (revisions.spec/revisioned-models)))

(deftest spec-columns-test
  (doseq [model (revisioned-models!)
          :let  [{:keys [track skip]} (revisions.spec/spec model)]]
    (testing (str model)
      (testing "lists no column twice, and none of the columns that no spec lists"
        (is (= (count (concat track skip)) (count (set (concat track skip)))))
        (is (empty? (filter revisions.spec/implicit-columns (concat track skip)))))
      (testing "lists each column of its table under `:track` or `:skip`: put a new column where it belongs"
        (is (= (set/difference (spec-test-util/table-columns model) revisions.spec/implicit-columns)
               (set (concat track skip))))))))

(defn- ancestors-of
  "The models above `model`, its parent first."
  [model]
  (when-let [parent (:model (revisions.spec/parent model))]
    (cons parent (ancestors-of parent))))

(deftest parent-test
  (doseq [model (revisioned-models!)
          :let  [{parent-model :model, parent-key :key} (revisions.spec/parent model)]
          :when parent-model]
    (testing (str model)
      (testing "belongs to a model with a spec, through a column of its table"
        (is (revisions.spec/revisioned? parent-model))
        (is (contains? (spec-test-util/table-columns model) parent-key)))
      (testing "reaches a model with Revisions of its own that nests it, or the parent that does"
        (let [chain (cons model (ancestors-of model))
              root  (last chain)
              top   (last (butlast chain))]
          (is (nil? (revisions.spec/parent root)))
          (is (contains? (into #{} (map :model) (vals (revisions.spec/children root))) top)))))))

(deftest children-test
  (doseq [model (revisioned-models!)
          [k {child-model :model, hydration-key :as}] (revisions.spec/children model)]
    (testing (str model " nests " child-model " under " k)
      (is (= model (:model (revisions.spec/parent child-model))))
      (is (keyword? hydration-key)))))

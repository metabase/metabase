(ns metabase.revisions.impl.measure-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.revisions.init]
   [metabase.revisions.models.revision :as revision]
   [metabase.test :as mt]
   [metabase.util :as u]))

(comment metabase.revisions.init/keep-me)

(defn- measure-definition [agg-fn field-key]
  (let [mp    (mt/metadata-provider)
        table (lib.metadata/table mp (mt/id :venues))
        field (lib.metadata/field mp (mt/id :venues field-key))]
    (lib/aggregate (lib/query mp table) (agg-fn field))))

(deftest ^:parallel diff-measures-str-rename-test
  (testing "renaming a measure produces a human-readable diff sentence"
    (is (= "renamed this Measure from \"Original\" to \"Updated\"."
           (u/build-sentence
            (revision/diff-strings :model/Measure
                                   {:name "Original"}
                                   {:name "Updated"}))))))

(deftest ^:parallel diff-measures-str-description-test
  (testing "adding a description produces a human-readable diff sentence"
    (is (= "added a description."
           (u/build-sentence
            (revision/diff-strings :model/Measure
                                   {:name "Original" :description nil}
                                   {:name "Original" :description "What it measures"}))))))

(deftest diff-measures-str-definition-only-test
  (testing "a definition-only change (e.g. changing the aggregation) currently produces no human-readable
           diff sentence -- diff-strings has no :definition case, unlike diff-map which does track it structurally"
    (let [before {:name "Orders Total" :definition (measure-definition lib/count :id)}
          after  (assoc before :definition (measure-definition lib/sum :price))]
      (is (some? (:definition (revision/diff-map :model/Measure before after)))
          "diff-map does track the definition change...")
      (is (nil? (u/build-sentence (revision/diff-strings :model/Measure before after)))
          "...but diff-strings has no wording for it, so no sentence is produced"))))

(ns metabase.revisions.specs.measure-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.revisions.init]
   [metabase.revisions.models.revision :as revision]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(comment metabase.revisions.init/keep-me)

(defn- diff-strings
  "The `revision/describe` of `o1` and `o2`, naming the Collections and Dashboards they reference."
  [model o1 o2]
  (revision/describe model o1 o2 (revision/readable-names (filterv some? [o1 o2]))))

(defn- measure-definition [agg-fn field-key]
  (let [mp    (mt/metadata-provider)
        table (lib.metadata/table mp (mt/id :venues))
        field (lib.metadata/field mp (mt/id :venues field-key))]
    (lib/aggregate (lib/query mp table) (agg-fn field))))

(deftest ^:parallel diff-measures-str-rename-test
  (testing "renaming a measure produces a human-readable diff sentence"
    (is (= "renamed this Measure from \"Original\" to \"Updated\"."
           (u/build-sentence
            (diff-strings :model/Measure
                          {:name "Original"}
                          {:name "Updated"}))))))

(deftest ^:parallel diff-measures-str-description-test
  (testing "adding a description produces a human-readable diff sentence"
    (is (= "added a description."
           (u/build-sentence
            (diff-strings :model/Measure
                          {:name "Original" :description nil}
                          {:name "Original" :description "What it measures"}))))))

(deftest diff-measures-str-definition-only-test
  (testing "a definition-only change (e.g. changing the aggregation) currently produces no human-readable
           diff sentence -- diff-strings has no :definition case, unlike diff-map which does track it structurally"
    (let [before {:name "Orders Total" :definition (measure-definition lib/count :id)}
          after  (assoc before :definition (measure-definition lib/sum :price))]
      (is (some? (:definition (revision/diff :model/Measure before after)))
          "diff-map does track the definition change...")
      (is (nil? (u/build-sentence (diff-strings :model/Measure before after)))
          "...but diff-strings has no wording for it, so no sentence is produced"))))

(deftest measure-revisions-hold-and-revert-no-dimensions-test
  (mt/with-temp [:model/Measure {id :id :as measure} {:name       "Measure"
                                                      :table_id   (mt/id :venues)
                                                      :definition (measure-definition lib/sum :price)}]
    (testing "the serialized measure has no dimension"
      (let [serialized (revision/snapshot :model/Measure (t2/select-one :model/Measure :id id))]
        (is (not-any? #(contains? serialized %) [:dimensions :dimension_mappings]))))
    (testing "reverting a stored revision that holds dimensions does not write them back"
      (let [stored (assoc (revision/snapshot :model/Measure measure)
                          :name "Reverted" :dimensions [{:id (str (random-uuid)) :name "stale" :status :status/active}] :dimension_mappings [])]
        (revision/revert-to-revision! :model/Measure id (mt/user->id :crowberto) stored)
        (is (=? {:name "Reverted" :dimensions nil}
                (t2/select-one :model/Measure :id id)))))))

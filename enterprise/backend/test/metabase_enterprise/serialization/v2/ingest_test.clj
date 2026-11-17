(ns metabase-enterprise.serialization.v2.ingest-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.test-util :as ts]
   [metabase-enterprise.serialization.v2.ingest :as ingest]
   [metabase.util.yaml :as yaml]))

(set! *warn-on-reflection* true)

(deftest basic-ingest-test
  (ts/with-random-dump-dir [dump-dir "serdesv2-"]
    (io/make-parents dump-dir "collections" "the_label" "fake")
    (io/make-parents dump-dir "collections" "other" "fake")
    (spit (io/file dump-dir "settings.yaml")
          (yaml/generate-string {:some-key    "with string value"
                                 :another-key 7
                                 :blank-key   nil}))
    (spit (io/file dump-dir "collections" "the_label" "the_label.yaml")
          (yaml/generate-string {:some "made up" :data "here" :entity_id "1234567890abcdefABCDE" :slug "the_label"
                                 :serdes/meta [{:model "Collection"}]}))
    (spit (io/file dump-dir "collections" "other" "other.yaml")
          (yaml/generate-string {:some "other" :data "in this one" :entity_id "0987654321zyxwvuABCDE"
                                 :serdes/meta [{:model "Collection"}]}))
    (let [ingestable (ingest/ingest-yaml dump-dir)
          expected   {[:model/Collection "1234567890abcdefABCDE"] {:some        "made up"
                                                                   :data        "here"
                                                                   :entity_id   "1234567890abcdefABCDE"
                                                                   :slug        "the_label"
                                                                   :serdes/meta [{:model "Collection"}]}
                      [:model/Collection "0987654321zyxwvuABCDE"] {:some        "other"
                                                                   :data        "in this one"
                                                                   :entity_id   "0987654321zyxwvuABCDE"
                                                                   :serdes/meta [{:model "Collection"}]}
                      [:model/Setting "some-key"]                 {:serdes/meta [{:model "Setting"}]
                                                                   :key         "some-key"
                                                                   :value       "with string value"}
                      [:model/Setting "another-key"]              {:serdes/meta [{:model "Setting"}] :key "another-key" :value 7}
                      [:model/Setting "blank-key"]                {:serdes/meta [{:model "Setting"}] :key "blank-key" :value nil}}]
      (testing "ingest-list returns key of every entity"
        (is (= (set (keys expected))
               (set (ingest/ingest-list ingestable)))))
      (testing "batched reads in any order are correct"
        (let [ks (shuffle (into [] cat (repeat 3 (keys expected))))]
          (is (= (mapv expected ks)
                 (ingest/ingest-many ingestable ks)))))
      (testing "missing key reads as nil"
        (is (= [nil] (ingest/ingest-many ingestable [[:model/Collection "missingmissingmissing0"]]))))
      (testing "ingested pairs each key with its entity"
        (is (= expected
               (into {} (ingest/ingested ingestable (keys expected)))))))))

(deftest ingest-skips-ineligible-files-test
  (ts/with-random-dump-dir [dump-dir "serdesv2-"]
    (io/make-parents dump-dir "collections" "fake")
    (io/make-parents dump-dir "not-a-legal-dir" "fake")
    (let [entity-yaml (yaml/generate-string {:some "data" :entity_id "1234567890abcdefABCDE"
                                             :serdes/meta [{:model "Collection"}]})]
      (spit (io/file dump-dir "collections" "in.yaml") entity-yaml)
      (spit (io/file dump-dir "collections" ".dotfile.yaml") "{{{ not yaml")
      (spit (io/file dump-dir "not-a-legal-dir" "out.yaml") entity-yaml)
      (spit (io/file dump-dir "top-level.yaml") entity-yaml)
      (spit (io/file dump-dir "collections" "not-yaml.txt") entity-yaml))
    (let [ingestable (ingest/ingest-yaml dump-dir)]
      (testing "only yaml files under legal top-level paths are ingested, without errors"
        (is (= [[:model/Collection "1234567890abcdefABCDE"]]
               (vec (ingest/ingest-list ingestable))))
        (is (empty? (ingest/ingest-errors ingestable)))))))

(deftest ingest-records-parse-errors-test
  (ts/with-random-dump-dir [dump-dir "serdesv2-"]
    (io/make-parents dump-dir "collections" "fake")
    (spit (io/file dump-dir "collections" "broken.yaml") "foo: [unclosed")
    (spit (io/file dump-dir "collections" "fine.yaml")
          (yaml/generate-string {:entity_id "1234567890abcdefABCDE" :serdes/meta [{:model "Collection"}]}))
    (let [ingestable (ingest/ingest-yaml dump-dir)]
      (is (= [[:model/Collection "1234567890abcdefABCDE"]]
             (vec (ingest/ingest-list ingestable))))
      (is (= [{:file "broken.yaml"}]
             (map ex-data (ingest/ingest-errors ingestable)))))))

(deftest keyword-reconstruction-test
  (ts/with-random-dump-dir [dump-dir "serdesv2-"]
    (io/make-parents dump-dir "collections" "cards" "fake")
    (spit (io/file dump-dir "collections" "cards" "some_card.yaml")
          (yaml/generate-string {:visualization_settings
                                 {:column_settings {"[\"name\",\"sum\"]" {:number_style "currency"}}}
                                 :entity_id   "1234567890abcdefABCDE"
                                 :serdes/meta [{:model "Card"}]}))
    (let [ingestable (ingest/ingest-yaml dump-dir)]
      (testing "file as read in reconstructs keywords only where legal"
        (is (= [{:visualization_settings {:column_settings {"[\"name\",\"sum\"]" {:number_style "currency"}}}
                 :entity_id              "1234567890abcdefABCDE"
                 :serdes/meta            [{:model "Card"}]}]
               (ingest/ingest-many ingestable [[:model/Card "1234567890abcdefABCDE"]])))))))

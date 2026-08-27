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
    (io/make-parents dump-dir "collections" "1234567890abcdefABCDE_the_label" "fake") ; Prepare the right directories.
    (io/make-parents dump-dir "collections" "0987654321zyxwvuABCDE" "fake")
    (spit (io/file dump-dir "settings.yaml")
          (yaml/generate-string {:some-key "with string value"
                                 :another-key 7
                                 :blank-key nil}))
    (spit (io/file dump-dir "collections" "1234567890abcdefABCDE_the_label" "1234567890abcdefABCDE_the_label.yaml")
          (yaml/generate-string {:some "made up" :data "here" :entity_id "1234567890abcdefABCDE" :slug "the_label" :serdes/meta [{:model "Collection"
                                                                                                                                  :id    "1234567890abcdefABCDE"
                                                                                                                                  :label "the_label"}]}))
    (spit (io/file dump-dir "collections" "0987654321zyxwvuABCDE" "0987654321zyxwvuABCDE.yaml")
          (yaml/generate-string {:some "other" :data "in this one" :entity_id "0987654321zyxwvuABCDE" :serdes/meta [{:model "Collection" :id "0987654321zyxwvuABCDE"}]}))
    (let [ingestable (ingest/ingest-yaml dump-dir)
          exp-files  {[{:model "Collection"
                        :id    "1234567890abcdefABCDE"
                        :label "the_label"}]                              {:some "made up"
                                                                           :data "here"
                                                                           :entity_id "1234567890abcdefABCDE"
                                                                           :slug "the_label"}
                      [{:model "Collection" :id "0987654321zyxwvuABCDE"}] {:some "other"
                                                                           :data "in this one"
                                                                           :entity_id "0987654321zyxwvuABCDE"}
                      [{:model "Setting" :id "some-key"}]                 {:key :some-key :value "with string value"}
                      [{:model "Setting" :id "another-key"}]              {:key :another-key :value 7}
                      [{:model "Setting" :id "blank-key"}]                {:key :blank-key :value nil}}]
      (testing "the right set of files is returned by ingest-list"
        (is (= (set (map #'ingest/strip-labels (keys exp-files)))
               (set (ingest/ingest-list ingestable)))))
      (testing "individual reads in any order are correct"
        (doseq [abs-path (->> exp-files
                              keys
                              (repeat 10)
                              (into [] cat)
                              shuffle)]
          (is (= (-> exp-files
                     (get abs-path)
                     (assoc :serdes/meta abs-path))
                 (ingest/ingest-one ingestable abs-path))))))))

(deftest flexible-file-matching-test
  (ts/with-random-dump-dir [dump-dir "serdesv2-"]
    (io/make-parents dump-dir "collections" "1234567890abcdefABCDE_human-readable-things" "fake")
    (spit (io/file dump-dir "collections" "1234567890abcdefABCDE_human-readable-things"
                   "1234567890abcdefABCDE_human-readable-things.yaml")
          (yaml/generate-string {:some "made up" :data "here" :serdes/meta [{:model "Collection" :id "1234567890abcdefABCDE" :label "human-readable-things"}]}))
    (let [ingestable (ingest/ingest-yaml dump-dir)
          exp {:some "made up" :data "here" :serdes/meta [{:model "Collection" :id "1234567890abcdefABCDE" :label "human-readable-things"}]}]
      (testing "the returned set of abstract paths does not contain labels"
        (is (= #{[{:model "Collection" :id "1234567890abcdefABCDE"}]}
               (into #{} (ingest/ingest-list ingestable)))))
      (testing "fetching the file with the label works"
        (is (= exp
               (ingest/ingest-one ingestable [{:model "Collection" :id "1234567890abcdefABCDE" :label "human-readable-things"}]))))
      (testing "fetching the file without the label also works"
        (is (= exp
               (ingest/ingest-one ingestable [{:model "Collection" :id "1234567890abcdefABCDE"}])))))))

(deftest path-interner-test
  (let [intern-path (#'ingest/path-interner)
        ;; rebuild every map and string so equal segments are distinct objects, like segments
        ;; parsed from separate YAML files
        fresh-seg   (fn [seg] (update-vals seg #(if (string? %) (String. ^String %) %)))
        prefix      [{:model "Database" :id "mydb"} {:model "Table" :id "T"}]
        path-1      (mapv fresh-seg (conj prefix {:model "Field" :id "F1"}))
        path-2      (mapv fresh-seg (conj prefix {:model "Field" :id "F2"}))
        interned-1  (intern-path path-1)
        interned-2  (intern-path path-2)]
    (testing "value equality is preserved"
      (is (= path-1 interned-1))
      (is (= path-2 interned-2)))
    (testing "equal prefix segments from different paths intern to the identical object"
      (is (identical? (interned-1 0) (interned-2 0)))
      (is (identical? (interned-1 1) (interned-2 1))))
    (testing "re-interning a fresh copy returns the same canonical objects"
      (let [reinterned (intern-path (mapv fresh-seg path-1))]
        (is (identical? (interned-1 0) (reinterned 0)))
        (is (identical? (interned-1 2) (reinterned 2)))))
    (testing "strings are interned even across unequal segments"
      (is (identical? (:model (interned-1 2)) (:model (interned-2 2)))))
    (testing "non-string :id segments pass through"
      (is (= [{:model "Setting" :id :some-key}]
             (intern-path [(fresh-seg {:model "Setting" :id :some-key})]))))))

(deftest ingest-all-interns-index-keys-test
  (ts/with-random-dump-dir [dump-dir "serdesv2-"]
    (io/make-parents dump-dir "databases" "fake")
    (doseq [field-id ["F1" "F2"]]
      (spit (io/file dump-dir "databases" (str field-id ".yaml"))
            (yaml/generate-string {:some "data"
                                   :serdes/meta [{:model "Database" :id "mydb"}
                                                 {:model "Table" :id "T"}
                                                 {:model "Field" :id field-id}]})))
    (let [{:keys [entities errors]} (#'ingest/ingest-all (io/file dump-dir))
          [key-1 key-2] (sort-by (comp :id last) (keys entities))]
      (is (empty? errors))
      (is (= [{:model "Database" :id "mydb"} {:model "Table" :id "T"} {:model "Field" :id "F1"}]
             key-1))
      (testing "sibling index keys share their prefix segments as identical objects"
        (is (identical? (key-1 0) (key-2 0)))
        (is (identical? (key-1 1) (key-2 1)))))))

(deftest ingest-all-skips-ineligible-files-test
  (ts/with-random-dump-dir [dump-dir "serdesv2-"]
    (io/make-parents dump-dir "collections" "fake")
    (io/make-parents dump-dir "not-a-legal-dir" "fake")
    (let [entity-yaml (yaml/generate-string {:some "data"
                                             :serdes/meta [{:model "Collection" :id "1234567890abcdefABCDE"}]})]
      (spit (io/file dump-dir "collections" "in.yaml") entity-yaml)
      (spit (io/file dump-dir "not-a-legal-dir" "out.yaml") entity-yaml)
      (spit (io/file dump-dir "top-level.yaml") entity-yaml)
      (spit (io/file dump-dir "collections" "not-yaml.txt") entity-yaml))
    (let [{:keys [entities errors]} (#'ingest/ingest-all (io/file dump-dir))]
      (testing "only yaml files under legal top-level paths are indexed, without errors"
        (is (= #{[{:model "Collection" :id "1234567890abcdefABCDE"}]}
               (set (keys entities))))
        (is (= "in.yaml" (.getName ^java.io.File (val (first entities)))))
        (is (empty? errors))))))

(deftest keyword-reconstruction-test
  (ts/with-random-dump-dir [dump-dir "serdesv2-"]
    (io/make-parents dump-dir "collections" "cards" "fake")
    (spit (io/file dump-dir "collections" "cards" "1234567890abcdefABCDE_some_card.yaml")
          (yaml/generate-string {:visualization_settings
                                 {:column_settings {"[\"name\",\"sum\"]" {:number_style "currency"}}}
                                 :serdes/meta [{:model "Card" :id "1234567890abcdefABCDE"}]}))
    (let [ingestable (ingest/ingest-yaml dump-dir)
          exp {:visualization_settings {:column_settings {"[\"name\",\"sum\"]" {:number_style "currency"}}}
               :serdes/meta [{:model "Card" :id "1234567890abcdefABCDE"}]}]
      (testing "the file as read in correctly reconstructs keywords only where legal"
        (is (= exp
               (ingest/ingest-one ingestable [{:model "Card" :id "1234567890abcdefABCDE"}])))))))

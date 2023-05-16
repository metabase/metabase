(ns metabase-enterprise.serialization.v2.ingest-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.test-util :as ts]
   [metabase-enterprise.serialization.v2.ingest :as ingest]
   [metabase.util.yaml :as yaml]))

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

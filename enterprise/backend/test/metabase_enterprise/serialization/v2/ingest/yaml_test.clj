(ns metabase-enterprise.serialization.v2.ingest.yaml-test
  (:require [clojure.java.io :as io]
            [clojure.test :refer :all]
            [metabase-enterprise.serialization.test-util :as ts]
            [metabase-enterprise.serialization.v2.ingest :as ingest]
            [metabase-enterprise.serialization.v2.ingest.yaml :as ingest.yaml]
            [yaml.core :as yaml]))

(deftest basic-ingest-test
  (ts/with-random-dump-dir [dump-dir "serdesv2-"]
    (io/make-parents dump-dir "Collection" "fake") ; Prepare the right directories.
    (spit (io/file dump-dir "settings.yaml")
          (yaml/generate-string {:some-key "with string value"
                                 :another-key 7
                                 :blank-key nil}))
    (spit (io/file dump-dir "Collection" "fake-id+the_label.yaml")
          (yaml/generate-string {:some "made up" :data "here" :entity_id "fake-id" :slug "the_label"}))
    (spit (io/file dump-dir "Collection" "no-label.yaml")
          (yaml/generate-string {:some "other" :data "in this one" :entity_id "no-label"}))

    (let [ingestable (ingest.yaml/ingest-yaml dump-dir)
          exp-files  {[{:model "Collection" :id "fake-id" :label "the_label"}] {:some "made up"
                                                                                :data "here"
                                                                                :entity_id "fake-id"
                                                                                :slug "the_label"}
                      [{:model "Collection" :id "no-label"}]                   {:some "other"
                                                                                :data "in this one"
                                                                                :entity_id "no-label"}
                      [{:model "Setting" :id "some-key"}]                      {:key :some-key :value "with string value"}
                      [{:model "Setting" :id "another-key"}]                   {:key :another-key :value 7}
                      [{:model "Setting" :id "blank-key"}]                     {:key :blank-key :value nil}}]
      (testing "the right set of file is returned by ingest-list"
        (is (= (set (keys exp-files))
               (into #{} (ingest/ingest-list ingestable)))))

      (testing "individual reads in any order are correct"
        (doseq [abs-path (->> exp-files
                              keys
                              (repeat 10)
                              (into [] cat)
                              shuffle)]
          (is (= (-> exp-files
                     (get abs-path)
                     (assoc :serdes/meta (mapv #(dissoc % :label) abs-path)))
                 (ingest/ingest-one ingestable abs-path))))))))

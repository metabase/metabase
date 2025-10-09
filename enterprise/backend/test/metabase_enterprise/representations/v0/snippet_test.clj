(ns metabase-enterprise.representations.v0.snippet-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.representations.export :as export]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(deftest snippet-export-entity-test
  (testing "snippet with template tag is exported correctly"
    (mt/with-temp [:model/NativeQuerySnippet {snippet-id :id :as snippet} {:name "snippet one"
                                                                           :description "the first snippet"
                                                                           :content "foo = 1"}]
      (is (= {:ref (str "snippet-" snippet-id),
              :type :snippet,
              :version :v0,
              :name "snippet one",
              :description "the first snippet",
              :sql "foo = 1",
              :template_tags {}}
             (export/export-entity snippet)))))
  (testing "snippet with variable template tag is exported correctly"
    (mt/with-temp [:model/NativeQuerySnippet {snippet-id :id :as snippet} {:name "foo snippet"
                                                                           :description "a test snippet"
                                                                           :content "foo = {{ val }}"}]
      (is (= {:ref (str "snippet-" snippet-id),
              :type :snippet,
              :version :v0,
              :name "foo snippet",
              :description "a test snippet",
              :sql "foo = {{ val }}",
              :template_tags {}}
             (export/export-entity snippet)))))
  (testing "snippet with card template tag is exported correctly"
    (let [mp (mt/metadata-provider)
          venues (lib.metadata/table mp (mt/id :venues))]
      (mt/with-temp [:model/Card {card-id :id} {:name "card one"
                                                :type :question
                                                :dataset_query (lib/query mp venues)}
                     :model/NativeQuerySnippet {snippet-id :id :as snippet} {:name "foo snippet"
                                                                             :description "a test snippet"
                                                                             :content (str "select * from {{ #" card-id "-card-one }} where id = 1")}]
        (is (= {:ref (str "snippet-" snippet-id),
                :type :snippet,
                :version :v0,
                :name "foo snippet",
                :description "a test snippet",
                :sql (format "select * from {{ #%s-card-one }} where id = 1" card-id),
                :template_tags {(str "#" card-id "-card-one") (str "ref:card-" card-id)}}
               (export/export-entity snippet))))))
  (testing "snippet with snippet template tag is exported correctly"
    (mt/with-temp [:model/NativeQuerySnippet {bar-snippet-id :id} {:name "bar snippet"
                                                                   :content "bar = 2"}
                   :model/NativeQuerySnippet {snippet-id :id :as snippet} {:name "foo snippet"
                                                                           :description "a test snippet"
                                                                           :content "foo = 1 and {{ snippet: bar snippet}}"}]
      (is (= {:ref (str "snippet-" snippet-id),
              :type :snippet,
              :version :v0,
              :name "foo snippet",
              :description "a test snippet",
              :sql "foo = 1 and {{ snippet: bar snippet}}",
              :template_tags {"snippet: bar snippet" (str "ref:snippet-" bar-snippet-id)}}
             (export/export-entity snippet)))))
  (testing "snippet with multiple template tags is exported correctly"
    (let [mp (mt/metadata-provider)
          venues (lib.metadata/table mp (mt/id :venues))]
      (mt/with-temp [:model/Card {card-id :id} {:name "card one"
                                                :type :question
                                                :dataset_query (lib/query mp venues)}
                     :model/NativeQuerySnippet {bar-snippet-id :id} {:name "bar snippet"
                                                                     :content "bar = 2"}
                     :model/NativeQuerySnippet {snippet-id :id :as snippet} {:name "snippet one"
                                                                             :description "the first snippet"
                                                                             :content (str "foo = {{ val }} and {{ snippet: bar snippet}} and (select id from {{ #" card-id "-card-one }} where id = 1)")}]
        (is (= {:ref (str "snippet-" snippet-id),
                :type :snippet,
                :version :v0,
                :name "snippet one",
                :description "the first snippet",
                :sql (str "foo = {{ val }} and {{ snippet: bar snippet}} and (select id from {{ #" card-id "-card-one }} where id = 1)"),
                :template_tags {(str "#" card-id "-card-one") (str "ref:card-" card-id)
                                "snippet: bar snippet" (str "ref:snippet-" bar-snippet-id)}}
               (export/export-entity snippet)))))))


(ns metabase-enterprise.representations.v0.snippet-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.import :as import]
   [metabase-enterprise.representations.toucan.core :as rep-t2]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(defn- run-snippet-export-import-test! [name description content exp-tags]
  (mt/with-temp [:model/NativeQuerySnippet {snippet-id :id :as snippet} {:name name
                                                                         :description description
                                                                         :content content}]
    (let [representation (export/export-entity snippet)
          toucan-model (->> (import/yaml->toucan representation nil)
                            (rep-t2/with-toucan-defaults :model/NativeQuerySnippet))
          _ (t2/delete! :model/NativeQuerySnippet :id snippet-id)
          persisted-snippet (import/insert! representation (v0-common/map-entity-index {}))]
      (try
        (is (= {:name (str "snippet-" snippet-id),
                :type :snippet,
                :version :v0,
                :display_name name,
                :description description,
                :sql content,
                :template_tags {}}
               representation))
        (is (=? {:name name,
                 :description description,
                 :content content,
                 :creator_id 13371338,
                 :template_tags exp-tags}
                toucan-model))
        (is (=? {:description description,
                 :archived false,
                 :dependency_analysis_version 0,
                 :content content,
                 :name name,
                 :creator_id 13371338,
                 :id (inc snippet-id),
                 :template_tags exp-tags}
                persisted-snippet))
        (finally
          (t2/delete! :model/NativeQuerySnippet :id (inc snippet-id)))))))

(deftest snippet-export-import-basic-test
  (testing "snippet with template tag is exported correctly"
    (run-snippet-export-import-test! "snippet one" "the first snippet" "foo = 1" {})))

(deftest snippet-export-import-variable-template-tag-test
  (testing "snippet with variable template tag is exported correctly"
    (run-snippet-export-import-test! "foo snippet" "a test snippet" "foo = {{ val }}" {"val" {:type :text :name "val" :display-name "Val"}})))

(deftest snippet-export-import-card-template-tag-test
  (testing "snippet with card template tag is exported correctly"
    (let [mp (mt/metadata-provider)
          venues (lib.metadata/table mp (mt/id :venues))]
      (mt/with-temp [:model/Card {card-id :id} {:name "card one"
                                                :type :question
                                                :dataset_query (lib/query mp venues)}
                     :model/NativeQuerySnippet {snippet-id :id :as snippet} {:name "foo snippet"
                                                                             :description "a test snippet"
                                                                             :content (str "select * from {{ #" card-id "-card-one }} where id = 1")}]
        (let [representation (export/export-entity snippet)
              toucan-model (->> (import/yaml->toucan representation nil)
                                (rep-t2/with-toucan-defaults :model/NativeQuerySnippet))
              _ (t2/delete! :model/NativeQuerySnippet :id snippet-id)
              persisted-snippet (import/insert! representation (v0-common/map-entity-index {}))]
          (try
            (is (= {:name (str "snippet-" snippet-id),
                    :type :snippet,
                    :version :v0,
                    :display_name "foo snippet",
                    :description "a test snippet",
                    :sql (str "select * from {{ #" card-id "-card-one }} where id = 1"),
                    :template_tags {(str "#" card-id "-card-one") (str "ref:card-" card-id)}}
                   representation))
            (is (=? {:name "foo snippet",
                     :description "a test snippet",
                     :content (str "select * from {{ #" card-id "-card-one }} where id = 1"),
                     :creator_id 13371338,
                     :template_tags {(str "#" card-id "-card-one")
                                     {:type :card,
                                      :name (str "#" card-id "-card-one"),
                                      :card-id card-id,
                                      :display-name (str "#" card-id " Card One")}}}
                    toucan-model))
            (is (=? {:description "a test snippet",
                     :archived false,
                     :dependency_analysis_version 0,
                     :content (str "select * from {{ #" card-id "-card-one }} where id = 1"),
                     :name "foo snippet",
                     :creator_id 13371338,
                     :id (inc snippet-id),
                     :template_tags {(str "#" card-id "-card-one")
                                     {:type :card,
                                      :name (str "#" card-id "-card-one"),
                                      :card-id card-id,
                                      :display-name (str "#" card-id " Card One")}}}
                    persisted-snippet))
            (finally
              (t2/delete! :model/NativeQuerySnippet :id (inc snippet-id)))))))))

(deftest snippet-export-import-snippet-template-tag-test
  (testing "snippet with snippet template tag is exported correctly"
    (mt/with-temp [:model/NativeQuerySnippet {bar-snippet-id :id} {:name "bar snippet"
                                                                   :content "bar = 2"}
                   :model/NativeQuerySnippet {snippet-id :id :as snippet} {:name "foo snippet"
                                                                           :description "a test snippet"
                                                                           :content "foo = 1 and {{ snippet: bar snippet}}"}]
      (let [representation (export/export-entity snippet)
            toucan-model (->> (import/yaml->toucan representation nil)
                              (rep-t2/with-toucan-defaults :model/NativeQuerySnippet))
            _ (t2/delete! :model/NativeQuerySnippet :id snippet-id)
            persisted-snippet (import/insert! representation (v0-common/map-entity-index {}))]
        (try
          (is (= {:name (str "snippet-" snippet-id),
                  :type :snippet,
                  :version :v0,
                  :display_name "foo snippet",
                  :description "a test snippet",
                  :sql "foo = 1 and {{ snippet: bar snippet}}",
                  :template_tags {"snippet: bar snippet" (str "ref:snippet-" bar-snippet-id)}}
                 (export/export-entity snippet)))
          (is (=? {:name "foo snippet",
                   :description "a test snippet",
                   :content "foo = 1 and {{ snippet: bar snippet}}",
                   :creator_id 13371338,
                   :template_tags {"snippet: bar snippet"
                                   {:type :snippet,
                                    :name "snippet: bar snippet",
                                    :snippet-name "bar snippet",
                                    :display-name "Snippet: Bar Snippet"}}}
                  toucan-model))
          (is (=? {:description "a test snippet",
                   :archived false,
                   :dependency_analysis_version 0,
                   :content "foo = 1 and {{ snippet: bar snippet}}",
                   :name "foo snippet",
                   :creator_id 13371338,
                   :id (inc snippet-id),
                   :template_tags {"snippet: bar snippet"
                                   {:type :snippet,
                                    :name "snippet: bar snippet",
                                    :snippet-name "bar snippet",
                                    :snippet-id bar-snippet-id
                                    :display-name "Snippet: Bar Snippet"}}}
                  persisted-snippet))
          (finally
            (t2/delete! :model/NativeQuerySnippet :id (inc snippet-id))))))))

(deftest snippet-export-import-multiple-template-tags-test
  (testing "snippet with multiple template tags is exported correctly"
    (let [mp (mt/metadata-provider)
          venues (lib.metadata/table mp (mt/id :venues))]
      (mt/with-temp [:model/Card {card-id :id} {:name "card one"
                                                :type :question
                                                :dataset_query (lib/query mp venues)}
                     :model/NativeQuerySnippet {bar-snippet-id :id} {:name "bar snippet"
                                                                     :content "bar = 2"}
                     :model/NativeQuerySnippet {snippet-id :id :as snippet} {:name "foo snippet"
                                                                             :description "a test snippet"
                                                                             :content (str "foo = {{ val }} and {{ snippet: bar snippet}} and (select id from {{ #" card-id "-card-one }} where id = 1)")}]
        (let [representation (export/export-entity snippet)
              toucan-model (->> (import/yaml->toucan representation nil)
                                (rep-t2/with-toucan-defaults :model/NativeQuerySnippet))
              _ (t2/delete! :model/NativeQuerySnippet :id snippet-id)
              persisted-snippet (import/insert! representation (v0-common/map-entity-index {}))]
          (try
            (is (= {:name (str "snippet-" snippet-id),
                    :type :snippet,
                    :version :v0,
                    :display_name "foo snippet",
                    :description "a test snippet",
                    :sql (str "foo = {{ val }} and {{ snippet: bar snippet}} and (select id from {{ #" card-id "-card-one }} where id = 1)"),
                    :template_tags {(str "#" card-id "-card-one") (str "ref:card-" card-id)
                                    "snippet: bar snippet" (str "ref:snippet-" bar-snippet-id)}}
                   (export/export-entity snippet)))
            (is (=? {:name "foo snippet",
                     :description "a test snippet",
                     :content (str "foo = {{ val }} and {{ snippet: bar snippet}} and (select id from {{ #" card-id "-card-one }} where id = 1)"),
                     :creator_id 13371338,
                     :template_tags {"snippet: bar snippet"
                                     {:type :snippet,
                                      :name "snippet: bar snippet",
                                      :snippet-name "bar snippet",
                                      :display-name "Snippet: Bar Snippet"}
                                     (str "#" card-id "-card-one")
                                     {:type :card,
                                      :name (str "#" card-id "-card-one"),
                                      :card-id card-id,
                                      :display-name (str "#" card-id " Card One")}
                                     "val" {:type :text :name "val" :display-name "Val"}}}
                    toucan-model))
            (is (=? {:description "a test snippet",
                     :archived false,
                     :dependency_analysis_version 0,
                     :content (str "foo = {{ val }} and {{ snippet: bar snippet}} and (select id from {{ #" card-id "-card-one }} where id = 1)"),
                     :collection_id nil,
                     :name "foo snippet",
                     :creator_id 13371338,
                     :id (inc snippet-id),
                     :template_tags {"snippet: bar snippet"
                                     {:type :snippet,
                                      :name "snippet: bar snippet",
                                      :snippet-name "bar snippet",
                                      :snippet-id bar-snippet-id
                                      :display-name "Snippet: Bar Snippet"}
                                     (str "#" card-id "-card-one")
                                     {:type :card,
                                      :name (str "#" card-id "-card-one"),
                                      :card-id card-id,
                                      :display-name (str "#" card-id " Card One")}
                                     "val" {:type :text :name "val" :display-name "Val"}}}
                    persisted-snippet))
            (finally
              (t2/delete! :model/NativeQuerySnippet :id (:id persisted-snippet)))))))))

(deftest representation-type-test
  (doseq [entity (t2/select :model/NativeQuerySnippet)]
    (is (= :snippet (v0-common/representation-type entity)))))

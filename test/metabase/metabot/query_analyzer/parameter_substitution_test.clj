(ns metabase.metabot.query-analyzer.parameter-substitution-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.metabot.query-analyzer.parameter-substitution :as nqa.sub]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(deftest ^:parallel replace-tags-without-template-tags-test
  (testing "Query without template tags returns raw SQL"
    (let [query (lib/native-query meta/metadata-provider "SELECT * FROM venues")]
      (is (= {:query "SELECT * FROM venues"}
             (nqa.sub/replace-tags query))))))

(deftest ^:parallel replace-tags-with-text-tag-test
  (testing "Query with :text template tag gets default value substituted"
    (let [query (lib/native-query meta/metadata-provider "SELECT * FROM venues WHERE name = {{name}}")]
      (is (=? {:query "SELECT * FROM venues WHERE name = ?"
               :params ["sample text"]}
              (nqa.sub/replace-tags query))))))

(deftest ^:parallel replace-tags-with-number-tag-test
  (testing "Query with :number template tag gets default value substituted"
    (let [query (lib/native-query meta/metadata-provider "SELECT * FROM venues WHERE id = {{id}}")
          tags (for [tag (lib/template-tags query)]
                 (assoc tag :type :number))
          query-with-tags (lib/with-template-tags query tags)]
      (is (=? {:query "SELECT * FROM venues WHERE id = 1"
               :params []}
              (nqa.sub/replace-tags query-with-tags))))))

(deftest ^:parallel replace-tags-with-date-tag-test
  (testing "Query with :date template tag gets default value substituted"
    (let [query (lib/native-query meta/metadata-provider "SELECT * FROM venues WHERE created_at = {{date}}")
          tags (for [tag (lib/template-tags query)]
                 (assoc tag :type :date))
          query-with-tags (lib/with-template-tags query tags)]
      (is (=? {:query "SELECT * FROM venues WHERE created_at = ?"
               :params [#t "2024-01-09"]}
              (nqa.sub/replace-tags query-with-tags))))))

(deftest ^:parallel replace-tags-with-multiple-tags-test
  (testing "Query with multiple template tags get default values substituted"
    (let [query (lib/native-query meta/metadata-provider
                                  "SELECT * FROM venues WHERE id = {{id}} AND name = {{name}}")
          tags (lib/template-tags query)
          tags (for [{tag-name :name, :as tag} tags]
                 (case tag-name
                   "id"   (assoc tag :type :number)
                   "name" (assoc tag :type :text)
                   tag))
          query-with-tags (lib/with-template-tags query tags)]
      (is (=? {:query  "SELECT * FROM venues WHERE id = 1 AND name = ?"
               :params ["sample text"]}
              (nqa.sub/replace-tags query-with-tags))))))

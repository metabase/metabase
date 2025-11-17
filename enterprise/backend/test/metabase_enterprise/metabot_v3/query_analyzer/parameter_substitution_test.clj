(ns metabase-enterprise.metabot-v3.query-analyzer.parameter-substitution-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.metabot-v3.query-analyzer.parameter-substitution :as nqa.sub]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]))

(deftest replace-tags-without-template-tags-test
  (testing "Query without template tags returns raw SQL"
    (let [query (lib/native-query meta/metadata-provider "SELECT * FROM venues")]
      (is (= {:query "SELECT * FROM venues"}
             (nqa.sub/replace-tags query))))))

(deftest replace-tags-with-text-tag-test
  (testing "Query with :text template tag gets default value substituted"
    (let [query (lib/native-query meta/metadata-provider "SELECT * FROM venues WHERE name = {{name}}")]
      (is (=? {:query "SELECT * FROM venues WHERE name = ?"
               :params ["sample text"]}
              (nqa.sub/replace-tags query))))))

(deftest replace-tags-with-number-tag-test
  (testing "Query with :number template tag gets default value substituted"
    (let [query (lib/native-query meta/metadata-provider "SELECT * FROM venues WHERE id = {{id}}")
          tags (-> (lib/template-tags query)
                   (update-vals #(assoc % :type :number)))
          query-with-tags (lib/with-template-tags query tags)]
      (is (=? {:query "SELECT * FROM venues WHERE id = 1"
               :params []}
              (nqa.sub/replace-tags query-with-tags))))))

(deftest replace-tags-with-date-tag-test
  (testing "Query with :date template tag gets default value substituted"
    (let [query (lib/native-query meta/metadata-provider "SELECT * FROM venues WHERE created_at = {{date}}")
          tags (-> (lib/template-tags query)
                   (update-vals #(assoc % :type :date)))
          query-with-tags (lib/with-template-tags query tags)]
      (is (=? {:query "SELECT * FROM venues WHERE created_at = ?"
               :params [#t "2024-01-09"]}
              (nqa.sub/replace-tags query-with-tags))))))

(deftest replace-tags-with-multiple-tags-test
  (testing "Query with multiple template tags get default values substituted"
    (let [query (lib/native-query meta/metadata-provider
                                  "SELECT * FROM venues WHERE id = {{id}} AND name = {{name}}")
          tags (-> (lib/template-tags query)
                   (update "id" #(assoc % :type :number))
                   (update "name" #(assoc % :type :text)))
          query-with-tags (lib/with-template-tags query tags)]
      (is (=? {:query "SELECT * FROM venues WHERE id = 1 AND name = ?"
               :params ["sample text"]}
              (nqa.sub/replace-tags query-with-tags))))))

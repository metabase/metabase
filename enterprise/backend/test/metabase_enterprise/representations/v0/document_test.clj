(ns metabase-enterprise.representations.v0.document-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.representations.core :as rep]
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.yaml :as rep-yaml]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest export-document-test
  (testing "Exporting a document produces valid EDN"
    (mt/with-temp [:model/Collection {collection-id :id} {:name "Test Collection"}
                   :model/Document {document-id :id} {:name "Test Document"
                                                      :collection_id collection-id
                                                      :document {:type "doc"
                                                                 :content [{:type "paragraph"
                                                                            :content [{:type "text"
                                                                                       :text "Hello, world!"}]}]}}]
      (let [exported (export/export-entity (t2/select-one :model/Document :id document-id))]
        (testing "has required fields"
          (is (= :document (:type exported)))
          (is (= :v0 (:version exported)))
          (is (= "Test Document" (:name exported)))
          (is (some? (:ref exported)))
          (is (some? (:entity-id exported)))
          (is (= "text/markdown+vnd.prose-mirror" (:content_type exported))))

        (testing "content is a string"
          (is (string? (:content exported)))
          (is (re-find #"Hello, world" (:content exported))))))))

(deftest export-import-singleton-test
  (testing "Export then import roundtrip for document"
    (mt/with-temp [:model/Collection {collection-id :id} {:name "Document Collection"}
                   :model/Document {document-id :id} {:name "My Document"
                                                      :collection_id collection-id
                                                      :document {:type "doc"
                                                                 :content [{:type "paragraph"
                                                                            :content [{:type "text"
                                                                                       :text "Test content"}]}
                                                                           {:type "heading"
                                                                            :attrs {:level 2}
                                                                            :content [{:type "text"
                                                                                       :text "Section Title"}]}]}}]
      (let [document (t2/select-one :model/Document :id document-id)
            ;; Export to EDN
            document-edn (export/export-entity document)
            ;; Convert to YAML
            document-yaml (rep-yaml/generate-string document-edn)
            ;; Parse back from YAML
            document-rep (rep-yaml/parse-string document-yaml)

            ;; Build ref-index with collection
            collection (t2/select-one :model/Collection :id collection-id)
            ref-index (v0-common/map-entity-index
                       {(v0-common/unref (v0-common/->ref collection-id :collection))
                        collection})

            ;; Persist the imported document
            imported-document (rep/persist! document-rep ref-index)
            imported-document (t2/select-one :model/Document :id (:id imported-document))

            ;; Export again and compare
            edn2 (export/export-entity imported-document)
            yaml2 (rep-yaml/generate-string edn2)
            rep2 (rep-yaml/parse-string yaml2)
            rep2 (rep/normalize-representation rep2)]

        (testing "roundtrip preserves document name"
          (is (= "My Document" (:name rep2))))

        (testing "roundtrip preserves document type"
          (is (= "document" (name (:type rep2)))))))))

(deftest representation-type-test
  (testing "representation-type multimethod returns :document"
    (mt/with-temp [:model/Document {document-id :id} {:name "Type Test Document"
                                                      :document {:type "doc"
                                                                 :content []}}]
      (let [document (t2/select-one :model/Document :id document-id)]
        (is (= :document (v0-common/representation-type document)))))))

(deftest type->model-test
  (testing "type->model multimethod converts :document to :model/Document"
    (is (= :model/Document (v0-common/type->model :document)))))

(deftest validate-exported-document-yaml-test
  (testing "Exported document YAML is valid and parseable"
    (mt/with-temp [:model/Document {document-id :id} {:name "YAML Test"
                                                      :document {:type "doc"
                                                                 :content [{:type "paragraph"
                                                                            :content [{:type "text"
                                                                                       :text "Test"}]}]}}]
      (let [document (t2/select-one :model/Document :id document-id)
            edn (export/export-entity document)
            yaml (rep-yaml/generate-string edn)]
        (testing "YAML is a valid string"
          (is (string? yaml))
          (is (pos? (count yaml))))

        (testing "YAML can be parsed back"
          (let [parsed (rep-yaml/parse-string yaml)]
            (is (map? parsed))
            ;; YAML parsing converts keywords to strings
            (is (= "document" (get parsed "type")))
            (is (= "v0" (get parsed "version")))
            (is (= "YAML Test" (get parsed "name")))))))))

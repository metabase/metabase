(ns metabase-enterprise.representations.v0.document-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.import :as import]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.yaml :as rep-yaml]
   [metabase.lib.core :as lib]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

#_(deftest markdown-prosemirror-roundtrip
    (let [md "# Hello"
          pm (#'v0-document/markdown->yaml md)
          edn (rep-yaml/parse-string pm)
          md2 (#'v0-document/edn->markdown edn)
          pm2 (#'v0-document/markdown->yaml md2)
          edn2 (rep-yaml/parse-string pm2)]
      (is (= md md2))
      (is (= edn edn2))))

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
          (is (= "Test Document" (:display_name exported)))
          (is (some? (:name exported)))
          (is (= :prosemirror (:content_type exported))))))))

(deftest export-import-singleton-test
  (testing "Export then import roundtrip for document"
    (mt/with-temp [:model/Collection {collection-id :id} {:name "Document Collection"}
                   :model/Document {document-id :id}
                   {:name "My Document"
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
            document-edn (export/export-entity document)
            document-yaml (rep-yaml/generate-string document-edn)
            document-rep (rep-yaml/parse-string document-yaml)
            collection (t2/select-one :model/Collection :id collection-id)
            ref-index (v0-common/map-entity-index
                       {(v0-common/unref (v0-common/->ref collection-id :collection))
                        collection})

            ;; Persist the imported document
            _ (import/update! document-rep document-id ref-index)
            imported-document (t2/select-one :model/Document :id document-id)

            ;; Export again and compare
            edn2 (export/export-entity imported-document)
            yaml2 (rep-yaml/generate-string edn2)
            rep2 (rep-yaml/parse-string yaml2)]

        (testing "roundtrip preserves document name"
          (is (= "My Document" (:display_name rep2))))

        (testing "roundtrip preserves document type"
          (is (= "document" (name (:type rep2)))))))))

(deftest representation-type-test
  (testing "representation-type multimethod returns :document"
    (mt/with-temp [:model/Document {document-id :id} {:name "Type Test Document"
                                                      :document {:type "doc"
                                                                 :content []}}]
      (let [document (t2/select-one :model/Document :id document-id)]
        (is (= :document (v0-common/representation-type document)))))))

(deftest document-card-embed-refs
  (mt/with-temp [:model/Card card {:type :question
                                   :dataset_query (lib/native-query (mt/metadata-provider) "select 1")}
                 :model/Document document
                 {:name "My Document"
                  :document {:type "resizeNode"
                             :attrs {:height 442
                                     :minHeight 280}
                             :content [{:type "cardEmbed"
                                        :attrs {:id (:id card)}}]}}]
    (let [rep (export/export-entity document)
          refs (v0-common/refs rep)]
      (is (contains? refs (str "question-" (:id card)))))))

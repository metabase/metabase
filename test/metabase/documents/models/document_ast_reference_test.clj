(ns metabase.documents.models.document-ast-reference-test
  "A `smartLink`/`cardEmbed` reference id in a document's ProseMirror AST is free-form and may be any JSON value.
  The serdes readers only resolve a reference whose id is a positive integer; anything else is ignored rather than
  handed to an app-DB lookup. These tests pin that behaviour."
  (:require
   [clojure.test :refer :all]
   [metabase.documents.models.document :as document]
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(def ^:private non-integer-id
  "A reference id that is not a positive integer, so the readers must ignore it."
  {:unresolved "x"})

(defn- ast-with [attrs]
  {:type "doc"
   :content [{:type "paragraph"
              :content [{:type prose-mirror/smart-link-type :attrs attrs :label "x"}]}]})

(deftest export-transform-ignores-a-non-integer-ast-id-test
  (mt/with-temp [:model/Document {doc-id :id} {:content_type prose-mirror/prose-mirror-content-type
                                               :document (ast-with {:model "card" :entityId non-integer-id})}]
    (let [doc (t2/select-one :model/Document 'id doc-id)]
      (testing "the stored value round-trips unchanged — the precondition for the rest of the test"
        (is (= non-integer-id (-> doc :document :content first :content first :attrs :entityId))))
      (testing "the export transform performs no lookup for the malformed reference"
        (let [lookups (atom [])]
          (with-redefs [t2/select-one (fn [& args] (swap! lookups conj args) nil)]
            (#'document/export-document-content doc :document nil))
          (is (every? (fn [args] (not-any? #(= non-integer-id %) args)) @lookups)))))))

(deftest descendants-ignores-a-non-integer-ast-id-test
  (doseq [model ["card" "table" "dashboard"]]
    (mt/with-temp [:model/Document {doc-id :id} {:content_type prose-mirror/prose-mirror-content-type
                                                 :document (ast-with {:model model :entityId non-integer-id})}]
      (testing (str "smartLink model=" model " with a non-integer id yields no descendant key")
        (is (empty? (filter (fn [[_model id]] (not (pos-int? id)))
                            (keys (serdes/descendants "Document" doc-id {})))))))))

(deftest descendants-omitted-model-is-also-ignored-test
  (testing "omitting attrs.model must not route around the check — id->entity-id defaults model to \"card\""
    (mt/with-temp [:model/Document {doc-id :id} {:content_type prose-mirror/prose-mirror-content-type
                                                 :document (ast-with {:entityId non-integer-id})}]
      (let [doc (t2/select-one :model/Document 'id doc-id)
            lookups (atom [])]
        (with-redefs [t2/select-one (fn [& args] (swap! lookups conj args) nil)]
          (#'document/export-document-content doc :document nil))
        (is (every? (fn [args] (not-any? #(= non-integer-id %) args)) @lookups))))))

(deftest serialization-dependencies-omit-a-non-integer-id-test
  (testing "export-time serialization dependencies skip a non-integer smartLink id"
    (mt/with-temp [:model/Document {doc-id :id} {:content_type prose-mirror/prose-mirror-content-type
                                                 :document (ast-with {:model "card" :entityId non-integer-id})}]
      (let [doc  (t2/select-one :model/Document 'id doc-id)
            deps (serdes/serialization-dependencies "Document" doc)]
        (is (not-any? (fn [dep] (some (comp map? :id) dep)) deps))))))

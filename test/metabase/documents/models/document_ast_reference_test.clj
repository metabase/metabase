(ns metabase.documents.models.document-ast-reference-test
  "A `smartLink`/`cardEmbed` reference id in a document's ProseMirror AST is free-form and may be any JSON value.
  The serdes readers only resolve a reference whose id is a positive integer; anything else is ignored rather than
  handed to an app-DB lookup. These tests pin that behaviour."
  (:require
   [clojure.test :refer :all]
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.serialization.core :as serialization]
   [metabase.serialization.protocol.stub :as protocol.stub]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(def ^:private non-integer-id
  "A reference id that is not a positive integer, so the readers must ignore it."
  {:unresolved "x"})

(defn- ast-with [attrs]
  {:type "doc"
   :content [{:type "paragraph"
              :content [{:type prose-mirror/smart-link-type :attrs attrs :label "x"}]}]})

(defn- exported-ids
  "The `[model id]` of each database id an export of `doc` resolves."
  [doc]
  (let [ids   (atom [])
        store (protocol.stub/stub-store
               {:fk       (fn [id model] (swap! ids conj [model id]) (apply str (repeat 21 "x")))
                :fk-keyed (fn [_id _model _column] "user@example.com")
                :table    (fn [id] (swap! ids conj [:model/Table id]) ["db" nil "table"])})]
    (serialization/export-batch :model/Document store [doc])
    @ids))

(deftest export-transform-ignores-a-non-integer-ast-id-test
  (mt/with-temp [:model/Document {doc-id :id} {:content_type prose-mirror/prose-mirror-content-type
                                               :document (ast-with {:model "card" :entityId non-integer-id})}]
    (let [doc (t2/select-one :model/Document :id doc-id)]
      (testing "stored value round-trips unchanged, precondition for rest of test"
        (is (= non-integer-id (get-in doc [:document :content 0 :content 0 :attrs "entityId"]))))
      (testing "export performs no lookup for malformed reference"
        (is (not-any? #(= non-integer-id (second %)) (exported-ids doc)))))))

(deftest export-dependencies-ignore-non-integer-ast-id-test
  (doseq [model ["card" "table" "dashboard"]]
    (mt/with-temp [:model/Document {doc-id :id} {:content_type prose-mirror/prose-mirror-content-type
                                                 :document (ast-with {:model model :entityId non-integer-id})}]
      (testing (str "smartLink model=" model " with non-integer id yields no dependency")
        (is (empty? (filter (fn [[_model id]] (not (pos-int? id)))
                            (first (serialization/export-dependencies
                                    :model/Document [(t2/select-one :model/Document :id doc-id)])))))))))

(deftest descendants-omitted-model-is-also-ignored-test
  (testing "omitting attrs.model must not route around check, since model defaults to \"card\""
    (mt/with-temp [:model/Document {doc-id :id} {:content_type prose-mirror/prose-mirror-content-type
                                                 :document (ast-with {:entityId non-integer-id})}]
      (is (not-any? #(= non-integer-id (second %))
                    (exported-ids (t2/select-one :model/Document :id doc-id)))))))

(deftest serialization-dependencies-omit-a-non-integer-id-test
  (testing "export-time serialization references skip non-integer smartLink id"
    (mt/with-temp [:model/Document {doc-id :id} {:content_type prose-mirror/prose-mirror-content-type
                                                 :document (ast-with {:model "card" :entityId non-integer-id})}]
      (let [doc  (t2/select-one :model/Document :id doc-id)
            deps (first (serialization/export-dependencies :model/Document [doc]))]
        (is (not-any? (fn [[_model id]] (map? id)) deps))))))

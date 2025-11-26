(ns metabase.documents.prose-mirror-test
  (:require
   [clojure.test :refer :all]
   [metabase.documents.prose-mirror :as prose-mirror]))

(deftest ^:parallel update-ast-basic-test
  (testing "updates nodes that match predicate"
    (let [doc {:document {:type "doc"
                          :content [{:type "paragraph"
                                     :content [{:type "text"
                                                :text "Hello"}]}
                                    {:type "paragraph"
                                     :content [{:type "text"
                                                :text "World"}]}]}
               :content_type prose-mirror/prose-mirror-content-type}
          predicate #(and (map? %) (= (:type %) "text"))
          updater #(assoc % :text (str (:text %) "!"))
          result (prose-mirror/update-ast doc predicate updater)]
      (is (= "Hello!" (get-in result [:document :content 0 :content 0 :text])))
      (is (= "World!" (get-in result [:document :content 1 :content 0 :text]))))))

(deftest ^:parallel update-ast-non-matching-test
  (testing "leaves non-matching nodes unchanged"
    (let [doc {:document {:type "doc"
                          :content [{:type "paragraph"
                                     :content [{:type "text"
                                                :text "Hello"}]}
                                    {:type "heading"
                                     :content [{:type "text"
                                                :text "Title"}]}]}
               :content_type prose-mirror/prose-mirror-content-type}
          predicate #(and (map? %) (= (:type %) "paragraph"))
          updater #(assoc % :modified true)
          result (prose-mirror/update-ast doc predicate updater)]
      (is (true? (get-in result [:document :content 0 :modified])))
      (is (nil? (get-in result [:document :content 1 :modified]))))))

(deftest ^:parallel update-ast-empty-document-test
  (testing "handles empty document"
    (let [doc {:document {}
               :content_type prose-mirror/prose-mirror-content-type}
          predicate #(= (:type %) "text")
          updater #(assoc % :updated true)
          result (prose-mirror/update-ast doc predicate updater)]
      (is (= {} (:document result))))))

(deftest ^:parallel update-ast-nested-structures-test
  (testing "handles nested structures"
    (let [doc {:document {:type "doc"
                          :content [{:type "table"
                                     :content [{:type "table_row"
                                                :content [{:type "table_cell"
                                                           :content [{:type "paragraph"
                                                                      :content [{:type "text"
                                                                                 :text "Cell"}]}]}]}]}]}
               :content_type prose-mirror/prose-mirror-content-type}
          predicate #(and (map? %) (= (:type %) "text"))
          updater #(update % :text str "-updated")
          result (prose-mirror/update-ast doc predicate updater)]
      (is (= "Cell-updated"
             (get-in result [:document :content 0 :content 0 :content 0 :content 0 :content 0 :text]))))))

(deftest ^:parallel update-ast-all-node-types-test
  (testing "predicate receives all node types including non-maps"
    (let [doc {:document {:type "doc"
                          :content ["string-node"
                                    42
                                    {:type "paragraph"}]}
               :content_type prose-mirror/prose-mirror-content-type}
          visited-nodes (atom [])
          predicate (fn [node]
                      (swap! visited-nodes conj node)
                      false)
          updater identity]
      (prose-mirror/update-ast doc predicate updater)
      (is (some string? @visited-nodes))
      (is (some number? @visited-nodes))
      (is (some map? @visited-nodes)))))

(deftest ^:parallel update-ast-updater-function-test
  (testing "updater function is applied correctly"
    (let [doc {:document {:type "doc"
                          :attrs {:level 1}}
               :content_type prose-mirror/prose-mirror-content-type}
          predicate #(and (map? %) (contains? % :attrs))
          updater #(update-in % [:attrs :level] inc)
          result (prose-mirror/update-ast doc predicate updater)]
      (is (= 2 (get-in result [:document :attrs :level]))))))

(deftest ^:parallel update-ast-invalid-content-type-test
  (testing "throws exception for invalid content-type"
    (let [doc {:document {:type "doc"}
               :content_type "text/plain"}
          predicate identity
          updater identity]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Document does not have the prose mirror content-type"
           (prose-mirror/update-ast doc predicate updater))))))

(deftest ^:parallel update-ast-exception-data-test
  (testing "exception contains correct data"
    (let [doc {:document {:type "doc"}
               :content_type "application/json"}
          predicate identity
          updater identity]
      (try
        (prose-mirror/update-ast doc predicate updater)
        (is false "Should have thrown exception")
        (catch clojure.lang.ExceptionInfo e
          (let [data (ex-data e)]
            (is (= "application/json" (:content-type data)))
            (is (= 400 (:status-code data)))))))))

(deftest ^:parallel update-ast-preserve-fields-test
  (testing "preserves other document fields"
    (let [doc {:document {:type "doc"}
               :content_type prose-mirror/prose-mirror-content-type
               :id 123
               :name "Test Doc"
               :other-field "value"}
          predicate (constantly false)
          updater identity
          result (prose-mirror/update-ast doc predicate updater)]
      (is (= 123 (:id result)))
      (is (= "Test Doc" (:name result)))
      (is (= "value" (:other-field result))))))

(deftest ^:parallel update-ast-nil-document-test
  (testing "handles nil document"
    (let [doc {:document nil
               :content_type prose-mirror/prose-mirror-content-type}
          predicate identity
          updater identity
          result (prose-mirror/update-ast doc predicate updater)]
      (is (nil? (:document result))))))

(deftest ^:parallel update-ast-multiple-updates-test
  (testing "multiple updates on same node"
    (let [doc {:document {:type "text" :text "hello"}
               :content_type prose-mirror/prose-mirror-content-type}
          predicate #(and (map? %) (= (:type %) "text"))
          updater #(-> %
                       (update :text str "!")
                       (assoc :modified true))
          result (prose-mirror/update-ast doc predicate updater)]
      (is (= "hello!" (get-in result [:document :text])))
      (is (true? (get-in result [:document :modified]))))))

(deftest ^:parallel update-ast-content-type-constant-test
  (testing "works with valid prose-mirror content-type constant"
    (let [doc {:document {:type "doc"}
               :content_type prose-mirror/prose-mirror-content-type}
          predicate (constantly false)
          updater identity]
      (is (some? (prose-mirror/update-ast doc predicate updater))))))

(deftest ^:parallel collect-ast-basic-test
  (testing "collects values from matching nodes"
    (let [doc {:document {:type "doc"
                          :content [{:type "paragraph"
                                     :content [{:type "text"
                                                :text "Hello"}]}
                                    {:type "paragraph"
                                     :content [{:type "text"
                                                :text "World"}]}]}
               :content_type prose-mirror/prose-mirror-content-type}
          collector #(when (and (map? %) (= (:type %) "text"))
                       (:text %))
          result (prose-mirror/collect-ast doc collector)]
      (is (= ["Hello" "World"] (vec result))))))

(deftest ^:parallel collect-ast-empty-results-test
  (testing "returns empty sequence when no matches"
    (let [doc {:document {:type "doc"
                          :content [{:type "paragraph"
                                     :content [{:type "text"
                                                :text "Hello"}]}]}
               :content_type prose-mirror/prose-mirror-content-type}
          collector #(when (= (:type %) "nonexistent") %)
          result (prose-mirror/collect-ast doc collector)]
      (is (empty? result)))))

(deftest ^:parallel collect-ast-nil-filtering-test
  (testing "removes nils from results"
    (let [doc {:document {:type "doc"
                          :content [{:type "paragraph"
                                     :content [{:type "text"
                                                :text "Hello"}]}
                                    {:type "heading"
                                     :content [{:type "text"
                                                :text "Title"}]}]}
               :content_type prose-mirror/prose-mirror-content-type}
          collector #(when (and (map? %) (= (:type %) "text") (= (:text %) "Hello"))
                       (:text %))
          result (prose-mirror/collect-ast doc collector)]
      (is (= ["Hello"] (vec result))))))

(deftest ^:parallel collect-ast-nested-structures-test
  (testing "works with nested structures"
    (let [doc {:document {:type "doc"
                          :content [{:type "table"
                                     :content [{:type "table_row"
                                                :content [{:type "table_cell"
                                                           :content [{:type "paragraph"
                                                                      :content [{:type "text"
                                                                                 :text "Cell1"}]}]}
                                                          {:type "table_cell"
                                                           :content [{:type "paragraph"
                                                                      :content [{:type "text"
                                                                                 :text "Cell2"}]}]}]}]}]}
               :content_type prose-mirror/prose-mirror-content-type}
          collector #(when (and (map? %) (= (:type %) "text"))
                       (:text %))
          result (prose-mirror/collect-ast doc collector)]
      (is (= ["Cell1" "Cell2"] (vec result))))))

(deftest ^:parallel collect-ast-traversal-order-test
  (testing "collector receives all nodes in tree traversal order"
    (let [doc {:document {:type "doc"
                          :content [{:type "paragraph"
                                     :content [{:type "text"
                                                :text "First"}]}
                                    {:type "paragraph"
                                     :content [{:type "text"
                                                :text "Second"}]}]}
               :content_type prose-mirror/prose-mirror-content-type}
          visited-types (atom [])
          collector (fn [node]
                      (when (map? node)
                        (swap! visited-types conj (:type node)))
                      nil)]
      (doall (prose-mirror/collect-ast doc collector))
      (is (= ["doc" "paragraph" "text" "paragraph" "text"] @visited-types)))))

(deftest ^:parallel collect-ast-lazy-sequence-test
  (testing "returns lazy sequence"
    (let [doc {:document {:type "doc"
                          :content [{:type "text" :text "test"}]}
               :content_type prose-mirror/prose-mirror-content-type}
          collector #(when (map? %) (:type %))
          result (prose-mirror/collect-ast doc collector)]
      (is (instance? clojure.lang.LazySeq result)))))

(deftest ^:parallel collect-ast-empty-document-test
  (testing "handles empty document"
    (let [doc {:document {}
               :content_type prose-mirror/prose-mirror-content-type}
          collector #(when (map? %) (:type %))
          result (prose-mirror/collect-ast doc collector)]
      (is (empty? result)))))

(deftest ^:parallel collect-ast-nil-document-test
  (testing "handles nil document"
    (let [doc {:document nil
               :content_type prose-mirror/prose-mirror-content-type}
          collector identity
          result (prose-mirror/collect-ast doc collector)]
      (is (empty? result)))))

(deftest ^:parallel collect-ast-complex-objects-test
  (testing "collector can return complex objects"
    (let [doc {:document {:type "doc"
                          :content [{:type "paragraph"
                                     :attrs {:id "p1"}
                                     :content [{:type "text"
                                                :text "Hello"}]}]}
               :content_type prose-mirror/prose-mirror-content-type}
          collector #(when (and (map? %) (= (:type %) "paragraph"))
                       {:id (get-in % [:attrs :id])
                        :type (:type %)})
          result (prose-mirror/collect-ast doc collector)]
      (is (= [{:id "p1" :type "paragraph"}] (vec result))))))

(deftest ^:parallel collect-ast-invalid-content-type-test
  (testing "throws exception for invalid content-type"
    (let [doc {:document {:type "doc"}
               :content_type "text/plain"}
          collector identity]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Document does not have the prose mirror content-type"
           (prose-mirror/collect-ast doc collector))))))

(deftest ^:parallel collect-ast-exception-data-test
  (testing "exception contains correct data for collect-ast"
    (let [doc {:document {:type "doc"}
               :content_type "application/xml"}
          collector identity]
      (try
        (doall (prose-mirror/collect-ast doc collector))
        (is false "Should have thrown exception")
        (catch clojure.lang.ExceptionInfo e
          (let [data (ex-data e)]
            (is (= "application/xml" (:content-type data)))
            (is (= 400 (:status-code data)))))))))

(deftest ^:parallel collect-ast-card-embed-test
  (testing "works with card embed nodes"
    (let [doc {:document {:type "doc"
                          :content [{:type prose-mirror/card-embed-type
                                     :attrs {:cardId 123}}]}
               :content_type prose-mirror/prose-mirror-content-type}
          collector #(when (and (map? %) (= (:type %) prose-mirror/card-embed-type))
                       (get-in % [:attrs :cardId]))
          result (prose-mirror/collect-ast doc collector)]
      (is (= [123] (vec result))))))

(deftest ^:parallel collect-ast-order-preservation-test
  (testing "preserves order of collection"
    (let [doc {:document {:type "doc"
                          :content [{:type "text" :text "first"}
                                    {:type "text" :text "second"}
                                    {:type "text" :text "third"}]}
               :content_type prose-mirror/prose-mirror-content-type}
          collector #(when (and (map? %) (= (:type %) "text"))
                       (:text %))
          result (prose-mirror/collect-ast doc collector)]
      (is (= ["first" "second" "third"] (vec result))))))

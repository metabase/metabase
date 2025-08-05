(ns metabase-enterprise.documents.prose-mirror-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.documents.prose-mirror :as prose-mirror]))

(deftest update-ast-test
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
      (is (= "World!" (get-in result [:document :content 1 :content 0 :text])))))

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
      (is (nil? (get-in result [:document :content 1 :modified])))))

  (testing "handles empty document"
    (let [doc {:document {}
               :content_type prose-mirror/prose-mirror-content-type}
          predicate #(= (:type %) "text")
          updater #(assoc % :updated true)
          result (prose-mirror/update-ast doc predicate updater)]
      (is (= {} (:document result)))))

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
             (get-in result [:document :content 0 :content 0 :content 0 :content 0 :content 0 :text])))))

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
      (is (some map? @visited-nodes))))

  (testing "updater function is applied correctly"
    (let [doc {:document {:type "doc"
                          :attrs {:level 1}}
               :content_type prose-mirror/prose-mirror-content-type}
          predicate #(and (map? %) (contains? % :attrs))
          updater #(update-in % [:attrs :level] inc)
          result (prose-mirror/update-ast doc predicate updater)]
      (is (= 2 (get-in result [:document :attrs :level])))))

  (testing "throws exception for invalid content-type"
    (let [doc {:document {:type "doc"}
               :content_type "text/plain"}
          predicate identity
          updater identity]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Document does not have the prose mirror content-type"
           (prose-mirror/update-ast doc predicate updater)))))

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
            (is (= 400 (:status-code data))))))))

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
      (is (= "value" (:other-field result)))))

  (testing "handles nil document"
    (let [doc {:document nil
               :content_type prose-mirror/prose-mirror-content-type}
          predicate identity
          updater identity
          result (prose-mirror/update-ast doc predicate updater)]
      (is (nil? (:document result)))))

  (testing "multiple updates on same node"
    (let [doc {:document {:type "text" :text "hello"}
               :content_type prose-mirror/prose-mirror-content-type}
          predicate #(and (map? %) (= (:type %) "text"))
          updater #(-> %
                       (update :text str "!")
                       (assoc :modified true))
          result (prose-mirror/update-ast doc predicate updater)]
      (is (= "hello!" (get-in result [:document :text])))
      (is (true? (get-in result [:document :modified])))))

  (testing "works with valid prose-mirror content-type constant"
    (let [doc {:document {:type "doc"}
               :content_type prose-mirror/prose-mirror-content-type}
          predicate (constantly false)
          updater identity]
      (is (some? (prose-mirror/update-ast doc predicate updater))))))

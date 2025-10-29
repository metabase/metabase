(ns representations.schema.v0.document-test
  (:require [clojure.test :refer :all]
            [representations.read :as read]))

(deftest document-schema-test
  (testing "document representation with prosemirror content is valid"
    (let [document {:type :document
                    :version :v0
                    :name "my-doc"
                    :display_name "My Document"
                    :content_type :prosemirror
                    :content {:type "doc" :content [{:type "paragraph" :content [{:type "text" :text "Hello World"}]}]}}]
      (is (= document
             (read/parse document)))))
  (testing "document representation with collection is valid"
    (let [document {:type :document
                    :version :v0
                    :name "my-doc"
                    :display_name "My Document"
                    :content_type :prosemirror
                    :content {:type "doc" :content []}
                    :collection "docs/guides"}]
      (is (= document
             (read/parse document))))))

(ns representations.schema.v0.document-test
  (:require [clojure.test :refer :all]
            [representations.read :as read]))

(deftest document-schema-test
  (testing "document representation with markdown content is valid"
    (let [document {:type :document
                    :version :v0
                    :ref "my-doc"
                    :name "My Document"
                    :content_type :markdown
                    :content "# Hello World\n\nThis is a test document."}]
      (is (= document
             (read/parse document)))))
  (testing "document representation with collection is valid"
    (let [document {:type :document
                    :version :v0
                    :ref "my-doc"
                    :name "My Document"
                    :content_type :html
                    :content "<h1>Hello</h1>"
                    :collection "docs/guides"}]
      (is (= document
             (read/parse document))))))

(ns metabase.api.docs-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.docs.regenerate :as regenerate]
   [metabase.api.open-api :as open-api]
   [metabase.test :as mt]))

(deftest write-openapi-spec-to-file-propagates-errors-test
  (mt/with-temp-dir [directory "openapi-output"]
    (with-redefs [regenerate/openapi-file-path directory
                  regenerate/open-api-object  (constantly {})]
      (is (thrown? java.io.IOException
                   (regenerate/write-openapi-spec-to-file! identity))))))

(deftest complete-openapi-document-test
  (let [spec {:paths      {"/api/dev" {} "/api/testing/restore/{name}" {} "/api/item" {}}
              :components {:schemas {"Unused" {:type "string"}}}}]
    (mt/with-dynamic-fn-redefs [open-api/root-open-api-object (constantly spec)]
      (is (= (assoc spec :servers [{:url "" :description "Metabase API"}])
             (regenerate/open-api-object identity))))))

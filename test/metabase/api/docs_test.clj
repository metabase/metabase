(ns metabase.api.docs-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.docs :as api.docs]
   [metabase.test :as mt]))

(deftest write-openapi-spec-to-file-propagates-errors-test
  (mt/with-temp-dir [directory "openapi-output"]
    (with-redefs [api.docs/openapi-file-path directory
                  api.docs/open-api-object  (constantly {})]
      (is (thrown? java.io.IOException
                   (api.docs/write-openapi-spec-to-file! identity))))))

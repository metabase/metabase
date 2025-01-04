(ns metabase.cmd.endpoint-dox-test
  (:require
   [clojure.test :refer :all]
   [metabase.cmd.endpoint-dox.markdown :as endpoint-dox.yaml]
   [metabase.cmd.endpoint-dox.metadata :as endpoint-dox.metadata]))

(deftest ^:parallel generate-all-dox-test
  (testing "Make sure we can successfully generate documentation for all API namespaces"
    (doseq [page (endpoint-dox.metadata/all-pages)]
      (testing (:ns page)
        (is (some? (endpoint-dox.yaml/page page)))))))

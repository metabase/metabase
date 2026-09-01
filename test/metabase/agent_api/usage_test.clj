(ns metabase.agent-api.usage-test
  (:require
   [clojure.test :refer :all]
   [metabase.agent-api.usage :as agent-api.usage]))

(deftest templatize-uri-test
  (testing "numeric path segments are replaced with :id"
    (is (= "/api/card/:id"           (agent-api.usage/templatize-uri "/api/card/134")))
    (is (= "/api/card/:id/query"     (agent-api.usage/templatize-uri "/api/card/134/query")))
    (is (= "/api/database/:id"       (agent-api.usage/templatize-uri "/api/database/2")))
    (is (= "/api/table/:id/fields"   (agent-api.usage/templatize-uri "/api/table/7/fields"))))
  (testing "multiple numeric segments"
    (is (= "/api/dashboard/:id/card/:id" (agent-api.usage/templatize-uri "/api/dashboard/5/card/42"))))
  (testing "UUID path segments are replaced with :uuid"
    (is (= "/api/card/:uuid/query"
           (agent-api.usage/templatize-uri "/api/card/abc12345-1234-1234-1234-123456789abc/query"))))
  (testing "non-numeric, non-UUID segments are left alone"
    (is (= "/api/search"                      (agent-api.usage/templatize-uri "/api/search")))
    (is (= "/api/collection/root/items"       (agent-api.usage/templatize-uri "/api/collection/root/items")))
    (is (= "/api/setting/site-name"           (agent-api.usage/templatize-uri "/api/setting/site-name")))))

(ns metabase.embedding.util-test
  (:require
   [clojure.test :refer :all]
   [metabase.embedding.util :as embed.util]))

(deftest is-embedding-header-test
  (testing "has-react-sdk-header? detects embedding-sdk-react client header"
    (is (embed.util/has-react-sdk-header? {:headers {"x-metabase-client" "embedding-sdk-react"}})))
  (testing "has-react-sdk-header? returns false for other client headers"
    (is (not (embed.util/has-react-sdk-header? {:headers {"x-metabase-client" "embedding-iframe"}})))))

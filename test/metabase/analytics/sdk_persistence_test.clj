(ns metabase.analytics.sdk-persistence-test
  "End-to-end coverage for the embedding client headers: a request carrying
  X-Metabase-Client / -Identifier / -Embedded-Preview must have its context
  persisted onto the analytics rows written during that request. The
  header-parsing details are covered in [[metabase.server.middleware.sdk-test]];
  this namespace covers the request -> `query_execution` row contract."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- venues-query [limit]
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
        (lib/limit limit))))

(defn- latest-query-execution [embedding-client]
  (t2/select-one :model/QueryExecution
                 :embedding_client embedding-client
                 {:order-by [[:id :desc]]}))

(deftest query-execution-embedding-client-test
  (mt/with-temporary-setting-values [synchronous-batch-updates true]
    (testing "the embedding client and identifier of the request are persisted on the QueryExecution row"
      (mt/user-http-request :crowberto :post 202 "dataset"
                            {:request-options
                             {:headers {"x-metabase-client"            "data-app"
                                        "x-metabase-client-identifier" "sales"}}}
                            (venues-query 1))
      (is (=? {:embedding_client            "data-app"
               :embedding_client_identifier "sales"}
              (latest-query-execution "data-app"))))
    (testing "a dev data app (preview header) is persisted as the data-app-preview client"
      (mt/user-http-request :crowberto :post 202 "dataset"
                            {:request-options
                             {:headers {"x-metabase-client"            "data-app"
                                        "x-metabase-client-identifier" "sales"
                                        "x-metabase-embedded-preview"  "true"}}}
                            (venues-query 2))
      (is (=? {:embedding_client            "data-app-preview"
               :embedding_client_identifier "sales"}
              (latest-query-execution "data-app-preview"))))))

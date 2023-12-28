(ns metabase.query-processor.middleware.resolve-referenced-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.query-processor.middleware.parameters-test
    :refer [card-template-tags]]
   [metabase.query-processor.middleware.resolve-referenced
    :as qp.resolve-referenced]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(deftest ^:parallel resolve-card-resources-test
  (testing "resolve stores source table from referenced card"
    (qp.store/with-metadata-provider (lib.tu/metadata-provider-with-cards-for-queries
                                      (lib.metadata.jvm/application-database-metadata-provider (mt/id))
                                      [(mt/mbql-query venues
                                         {:filter [:< $price 3]})])
      (let [query {:database (mt/id)
                   :native   {:template-tags
                              {"tag-name-not-important1" {:type    :card
                                                          :card-id 1}}}}]
        (is (= query
               (#'qp.resolve-referenced/resolve-referenced-card-resources* query)))
        (is (some? (lib.metadata.protocols/cached-metadata
                    (qp.store/metadata-provider)
                    :metadata/table
                    (mt/id :venues))))
        (is (some? (lib.metadata.protocols/cached-metadata
                    (qp.store/metadata-provider)
                    :metadata/column
                    (mt/id :venues :price))))))))

(deftest ^:parallel referenced-query-from-different-db-test
  (testing "fails on query that references a native query from a different database"
    (qp.store/with-metadata-provider (lib.tu/metadata-provider-with-cards-for-queries
                                      meta/metadata-provider
                                      [{:database (meta/id)
                                        :type     :native
                                        :native   {:query "SELECT 1 AS \"foo\", 2 AS \"bar\", 3 AS \"baz\""}}])
      (let [card-query (:dataset-query (lib.metadata/card (qp.store/metadata-provider) 1))
            tag-name   "#1"
            query      {:database 1234
                        :type     :native
                        :native   {:query         (format "SELECT * FROM {{%s}} AS x" tag-name)
                                   :template-tags {tag-name ; This tag's query is from the test db
                                                   {:id   tag-name, :name    tag-name, :display-name tag-name,
                                                    :type "card",   :card-id 1}}}}]
        (is (= {:referenced-query     card-query
                :expected-database-id 1234}
               (try
                 (#'qp.resolve-referenced/check-query-database-id= card-query 1234)
                 (catch ExceptionInfo exc
                   (ex-data exc)))))
        (is (nil? (#'qp.resolve-referenced/check-query-database-id= card-query (meta/id))))
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"\QReferenced query is from a different database\E"
             (#'qp.resolve-referenced/resolve-referenced-card-resources* query)))
        (is (= {:referenced-query     card-query
                :expected-database-id 1234}
               (try
                 (#'qp.resolve-referenced/resolve-referenced-card-resources* query)
                 (catch ExceptionInfo exc
                   (ex-data exc)))))))))

(deftest ^:parallel referenced-query-from-different-db-test-2
  (testing "fails on query that references an MBQL query from a different database"
    (qp.store/with-metadata-provider (lib.tu/metadata-provider-with-cards-for-queries
                                      meta/metadata-provider
                                      [(lib.tu.macros/mbql-query venues
                                         {:filter [:< $price 3]})])
      (let [card-query  (:dataset-query (lib.metadata/card (qp.store/metadata-provider) 1))
            tag-name    "#1"
            query-db-id 1234
            query       {:database query-db-id ; Note outer-query-db is used here
                         :type     :native
                         :native   {:query         (format "SELECT * FROM {{%s}} AS x" tag-name)
                                    :template-tags {tag-name ; This tag's query is from the test db
                                                    {:id tag-name, :name tag-name, :display-name tag-name,
                                                     :type "card", :card-id 1}}}}]
        (is (= {:referenced-query     card-query
                :expected-database-id query-db-id}
               (try
                 (#'qp.resolve-referenced/check-query-database-id= card-query query-db-id)
                 (catch ExceptionInfo exc
                   (ex-data exc)))))
        (is (nil? (#'qp.resolve-referenced/check-query-database-id= card-query (meta/id))))
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"\QReferenced query is from a different database\E"
             (#'qp.resolve-referenced/resolve-referenced-card-resources* query)))
        (is (= {:referenced-query     card-query
                :expected-database-id query-db-id}
               (try
                 (#'qp.resolve-referenced/resolve-referenced-card-resources* query)
                 (catch ExceptionInfo exc
                   (ex-data exc)))))))))

(deftest ^:parallel circular-referencing-tags-test
  (testing "fails on query with circular referencing sub-queries"
    (qp.store/with-metadata-provider (lib.tu/metadata-provider-with-cards-for-queries
                                      meta/metadata-provider
                                      [{:database (meta/id)
                                        :type     :native
                                        :native   {:query         "SELECT * FROM {{#2}} AS c2"
                                                   :template-tags (card-template-tags [2])}}
                                       {:database (meta/id)
                                        :type     :native
                                        :native   {:query         "SELECT * FROM {{#1}} AS c1"
                                                   :template-tags (card-template-tags [1])}}])
      (let [entrypoint-query {:database (meta/id)
                              :type     :native
                              :native   {:query         "SELECT * FROM {{#1}}"
                                         :template-tags (card-template-tags [1])}}]
        (is (thrown?
             ExceptionInfo
             (#'qp.resolve-referenced/check-for-circular-references entrypoint-query)))
        (try
          (#'qp.resolve-referenced/check-for-circular-references entrypoint-query)
          (catch ExceptionInfo e
            (is (= (#'qp.resolve-referenced/circular-ref-error 2 1)
                   (ex-message e)))))))))

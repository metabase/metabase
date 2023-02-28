(ns metabase.lib.query-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta])
  #?(:cljs (:require [metabase.test-runner.assert-exprs.approximately-equal])))

(deftest ^:parallel mbql-query-test
  (is (=? {:lib/type :mbql/query
           :database (meta/id)
           :type     :pipeline
           :stages   [{:lib/type     :mbql.stage/mbql
                       :lib/options  {:lib/uuid string?}
                       :source-table (meta/id :venues)}]}
          (-> (lib/query meta/metadata "VENUES")
              (dissoc :lib/metadata)))))

(deftest ^:parallel native-query-test
  (is (=? {:lib/type :mbql/query
           :database (meta/id)
           :type     :pipeline
           :stages   [{:lib/type    :mbql.stage/native
                       :lib/options {:lib/uuid string?}
                       :native      "SELECT * FROM VENUES;"}]}
          (-> (lib/native-query meta/metadata meta/results-metadata "SELECT * FROM VENUES;")
              (dissoc :lib/metadata)))))

(deftest ^:parallel card-source-query-test
  (is (=? {:lib/type :mbql/query
           :database 1
           :type     :pipeline
           :stages   [{:lib/type    :mbql.stage/native
                       :lib/options {:lib/uuid string?}
                       :native      "SELECT * FROM VENUES;"}]}
          (-> (lib/saved-question-query {:dataset_query   {:database 1
                                                           :type     :native
                                                           :native   {:query "SELECT * FROM VENUES;"}}
                                         :result_metadata meta/results-metadata})
              (dissoc :lib/metadata)))))

(deftest ^:parallel notebook-query-test
  (is (=? {:lib/type :mbql/query
           :database 1
           :type     :pipeline
           :stages   [{:lib/type     :mbql.stage/mbql
                       :lib/options  {:lib/uuid string?}
                       :source-table (meta/id :venues)}
                      {:lib/type    :mbql.stage/mbql
                       :lib/options {:lib/uuid string?}}
                      {:lib/type    :mbql.stage/mbql
                       :lib/options {:lib/uuid string?}}]}
          (-> (lib/query meta/metadata {:database 1
                                        :type     :query
                                        :query    {:source-query {:source-query {:source-table (meta/id :venues)}}}})
              (dissoc :lib/metadata)))))

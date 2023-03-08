(ns metabase.lib.query-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

(deftest ^:parallel native-query-test
  (is (=? {:lib/type :mbql/query
           :database (meta/id)
           :type     :pipeline
           :stages   [{:lib/type    :mbql.stage/native
                       :lib/options {:lib/uuid uuid?}
                       :native      "SELECT * FROM VENUES;"}]}
          (-> (lib/native-query meta/metadata-provider meta/results-metadata "SELECT * FROM VENUES;")
              (dissoc :lib/metadata)))))

(deftest ^:parallel card-source-query-test
  (is (=? {:lib/type :mbql/query
           :database (meta/id)
           :type     :pipeline
           :stages   [{:lib/type    :mbql.stage/native
                       :lib/options {:lib/uuid uuid?}
                       :native      "SELECT * FROM VENUES;"}]}
          (lib/saved-question-query meta/metadata-provider
                                    {:dataset_query   {:database (meta/id)
                                                       :type     :native
                                                       :native   {:query "SELECT * FROM VENUES;"}}
                                     :result_metadata meta/results-metadata}))))

(deftest ^:parallel notebook-query-test
  (is (=? {:lib/type :mbql/query
           :database (meta/id)
           :type     :pipeline
           :stages   [{:lib/type     :mbql.stage/mbql
                       :lib/options  {:lib/uuid uuid?}
                       :source-table (meta/id :venues)}
                      {:lib/type    :mbql.stage/mbql
                       :lib/options {:lib/uuid uuid?}}
                      {:lib/type    :mbql.stage/mbql
                       :lib/options {:lib/uuid uuid?}}]}
          (lib/query meta/metadata-provider {:database (meta/id)
                                             :type     :query
                                             :query    {:source-query {:source-query {:source-table (meta/id :venues)}}}}))))

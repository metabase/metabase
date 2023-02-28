(ns metabase.lib.query-test
  (:require
   [clojure.test :as t]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta])
  #?(:cljs (:require [metabase.test-runner.assert-exprs.approximately-equal])))

(t/deftest ^:parallel mbql-query-test
  (t/is (=? {:lib/type     :mbql/query
             :lib/metadata {:id (meta/id)}
             :database     (meta/id)
             :type         :pipeline
             :stages       [{:lib/type           :mbql.stage/mbql
                             :lib/stage-metadata {:lib/type :metadata/stage
                                                  :columns  [{:lib/type :metadata/field, :name "ID"}
                                                             {:lib/type :metadata/field, :name "NAME"}
                                                             {:lib/type :metadata/field, :name "CATEGORY_ID"}
                                                             {:lib/type :metadata/field, :name "LATITUDE"}
                                                             {:lib/type :metadata/field, :name "LONGITUDE"}
                                                             {:lib/type :metadata/field, :name "PRICE"}]}
                             :lib/options        {:lib/uuid string?}
                             :source-table       (meta/id :venues)}]}
            (lib/query meta/metadata "VENUES"))))

(t/deftest ^:parallel native-query-test
  (t/is (=? {:lib/type     :mbql/query
             :lib/metadata {:id (meta/id)}
             :database     (meta/id)
             :type         :pipeline
             :stages       [{:lib/type           :mbql.stage/native
                             :lib/stage-metadata {:columns meta/results-metadata}
                             :lib/options        {:lib/uuid string?}
                             :native             "SELECT * FROM VENUES;"}]}
            (lib/native-query meta/metadata meta/results-metadata "SELECT * FROM VENUES;"))))

(t/deftest ^:parallel card-source-query-test
  (t/is (=? {:lib/type     :mbql/query
             :lib/metadata {:id 1}
             :database     1
             :type         :pipeline
             :stages       [{:lib/type           :mbql.stage/mbql
                             :lib/stage-metadata {:columns meta/results-metadata}
                             :lib/options        {:lib/uuid string?}
                             :source-table       "card__1234"}]}
            (lib/saved-question-query {:id 1}
                                      {:id              1234
                                       :result_metadata meta/results-metadata}))))

(t/deftest ^:parallel notebook-query-test
  (t/is (=? {:lib/type     :mbql/query
             :lib/metadata {:id (meta/id)}
             :database     1
             :type         :pipeline
             :stages       [{:lib/type           :mbql.stage/mbql
                             :lib/stage-metadata {:lib/type :metadata/stage
                                                  :columns  [{:lib/type :metadata/field, :name "ID"}
                                                             {:lib/type :metadata/field, :name "NAME"}
                                                             {:lib/type :metadata/field, :name "LAST_LOGIN"}]}
                             :lib/options        {:lib/uuid string?}
                             :source-table       (meta/id :users)}
                            {:lib/type           :mbql.stage/mbql
                             :lib/stage-metadata {:lib/type :metadata/stage
                                                  :columns  [{:lib/type :metadata/field, :name "ID"}
                                                             {:lib/type :metadata/field, :name "NAME"}
                                                             {:lib/type :metadata/field, :name "LAST_LOGIN"}]}
                             :lib/options        {:lib/uuid string?}}
                            {:lib/type           :mbql.stage/mbql
                             :lib/stage-metadata {:lib/type :metadata/stage
                                                  :columns  [{:lib/type :metadata/field, :name "ID"}
                                                             {:lib/type :metadata/field, :name "NAME"}
                                                             {:lib/type :metadata/field, :name "LAST_LOGIN"}]}
                             :lib/options        {:lib/uuid string?}}]}
            (lib/query meta/metadata {:database 1
                                      :type     :query
                                      :query    {:source-query {:source-query {:source-table (meta/id :users)}}}}))))

(t/deftest ^:parallel infer-metadata-test
  (t/is (=? {:stages [{:lib/options        {:lib/uuid string?}
                       :lib/stage-metadata {:columns [{:lib/type :metadata/field, :name "ID"}
                                                      {:lib/type :metadata/field, :name "NAME"}
                                                      {:lib/type :metadata/field, :name "LAST_LOGIN"}]}
                       :source-table       (meta/id :users)}
                      {:lib/options        {:lib/uuid string?}
                       :lib/stage-metadata {:columns [{:lib/type     :metadata/field
                                                       :name         "NAME"
                                                       :display_name "Name"
                                                       :field_ref    [:field (meta/id :users :name) {:lib/uuid string?}]}
                                                      {:lib/type     :metadata/field
                                                       :name         "sum"
                                                       :display_name "Sum of ID"
                                                       :field_ref    [:aggregation {:lib/uuid string?} 0]}]}
                       ;; FIXME: the clauses should be getting UUID'ed on the way in
                       :aggregation        [[:sum #_{:lib/uuid string?} [:field (meta/id :users :id) nil #_{:lib/uuid string?}]]]
                       :breakout           [[:field (meta/id :users :name) nil #_{:lib/uuid string?}]]}]}
            (lib/query meta/metadata
                       {:lib/type :mbql/query
                        :database (meta/id)
                        :type     :pipeline
                        :stages   [{:lib/type     :mbql.stage/mbql
                                    :source-table (meta/id :users)}
                                   {:lib/type    :mbql.stage/mbql
                                    :aggregation [[:sum [:field (meta/id :users :id) nil]]]
                                    :breakout    [[:field (meta/id :users :name) nil]]}]}))))

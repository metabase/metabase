(ns metabase.lib.query-test
  #?@
   (:clj
    [(:require
      [clojure.test :as t]
      [metabase.lib :as lib]
      [metabase.lib.test-metadata :as meta])]
    :cljs
    [(:require
      [cljs.test :as t :include-macros true]
      [metabase.lib :as lib]
      [metabase.lib.test-metadata :as meta])]))

(t/deftest ^:parallel mbql-query-test
  (t/is (=? {:lib/type :lib/outer-query
             :database (meta/id)
             :type     :query
             :query    {:lib/type     :lib/inner-query
                        :source-table (meta/id :venues)}}
            (-> (lib/query meta/metadata "VENUES")
                (dissoc :lib/metadata)))))

(t/deftest ^:parallel native-query-test
  (t/is (=? {:lib/type :lib/outer-query
             :database 1
             :type     :native
             :native   {:query "SELECT * FROM VENUES;"}}
            (-> (lib/native-query meta/metadata meta/results-metadata "SELECT * FROM VENUES;")
                (dissoc :lib/metadata)))))

(t/deftest ^:parallel card-source-query-test
  (t/is (=? {:lib/type :lib/outer-query
             :database 1
             :type     :native
             :native   {:query "SELECT * FROM VENUES;"}}
            (-> (lib/saved-question-query {:dataset_query   {:database 1
                                                             :type     :native
                                                             :native   {:query "SELECT * FROM VENUES;"}}
                                           :result_metadata meta/results-metadata})
                (dissoc :lib/metadata)))))

(t/deftest ^:parallel notebook-query-test
  (t/is (=? {:lib/type :lib/outer-query
             :database 1
             :type     :query
             :query    {:lib/type     :lib/inner-query
                        :lib/options  {:lib/uuid string?}
                        :source-query {:lib/type     :lib/inner-query
                                       :lib/options  {:lib/uuid string?}
                                       :source-query {:lib/type     :lib/inner-query
                                                      :lib/options  {:lib/uuid string?}
                                                      :source-table (meta/id :venues)}}}}
            (-> (lib/query meta/metadata {:database 1
                                          :type     :query
                                          :query    {:source-query {:source-query {:source-table (meta/id :venues)}}}})
                (dissoc :lib/metadata)))))

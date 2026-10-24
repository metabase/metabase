(ns metabase.query-processor.middleware.annotate.legacy-helper-fns-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.query-processor.middleware.annotate.legacy-helper-fns :as annotate.legacy-helper-fns]
   ;; binds mock metadata providers via the ambient store, which the code under test reads
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.match :as match]))

(deftest ^:parallel aggregation-name-test
  (let [inner-query {:source-query    {:source-table (meta/id :venues)}
                     :source-metadata [(match/replace-all (lib/lib-metadata-column->legacy-metadata-column
                                                           (meta/field-metadata :venues :name))
                                         #'keyword? (u/qualified-name &match))]
                     :aggregation     [[:count]]}]
    (qp.store/with-metadata-provider meta/metadata-provider
      (is (= "count"
             ;; the deprecated fn is what this test exists to cover
             #_{:clj-kondo/ignore [:deprecated-var]}
             (annotate.legacy-helper-fns/aggregation-name inner-query [:count]))))))

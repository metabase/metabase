(ns metabase.query-processor.middleware.annotate.legacy-helper-fns-test
  (:require
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase.lib.test-metadata :as meta]
   [metabase.query-processor.middleware.annotate.legacy-helper-fns :as annotate.legacy-helper-fns]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]))

(deftest ^:parallel aggregation-name-test
  (let [inner-query {:source-query    {:source-table (meta/id :venues)}
                     :source-metadata [(walk/postwalk
                                        (fn [form]
                                          (cond-> form
                                            (keyword? form) u/qualified-name))
                                        (meta/field-metadata :venues :name))]
                     :aggregation     [[:count]]}]
    (qp.store/with-metadata-provider meta/metadata-provider
      (is (= "count"
             (annotate.legacy-helper-fns/aggregation-name inner-query [:count]))))))

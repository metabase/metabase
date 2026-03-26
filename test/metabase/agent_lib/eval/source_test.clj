(ns metabase.agent-lib.eval.source-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.agent-lib.eval.source :as source]
   [metabase.agent-lib.runtime :as runtime]
   [metabase.agent-lib.test-util :as tu]
   [metabase.lib.test-metadata :as meta]))

(deftest ^:parallel resolve-source-context-test
  (testing "context source returns the source from runtime bindings"
    (let [base-query (tu/query-for-table :orders)
          rt         (runtime/build-runtime meta/metadata-provider {'source base-query})
          result     (source/resolve-source identity rt [:source] {:type "context" :ref "source"})]
      (is (= base-query result)))))

(deftest resolve-source-context-missing-test
  (testing "context source throws when unavailable in runtime bindings"
    (let [rt    (runtime/build-runtime meta/metadata-provider)
          error (try
                  (source/resolve-source identity rt [:source] {:type "context" :ref "source"})
                  nil
                  (catch clojure.lang.ExceptionInfo e e))]
      (is error)
      (is (= :invalid-generated-program (:error (ex-data error))))
      (is (re-find #"context source is unavailable"
                   (:details (ex-data error)))))))

(deftest ^:parallel resolve-source-table-test
  (testing "table source calls table lookup with id and returns a query"
    (let [rt     (runtime/build-runtime meta/metadata-provider)
          result (source/resolve-source identity rt [:source] {:type "table" :id (meta/id :orders)})]
      (is (map? result)))))

(deftest resolve-source-unsupported-type-test
  (testing "unsupported source type throws"
    (let [rt    (runtime/build-runtime meta/metadata-provider)
          error (try
                  (source/resolve-source identity rt [:source] {:type "unknown"})
                  nil
                  (catch clojure.lang.ExceptionInfo e e))]
      (is error)
      (is (= :invalid-generated-program (:error (ex-data error))))
      (is (re-find #"unsupported source type"
                   (:details (ex-data error)))))))

(deftest ^:parallel resolve-source-program-test
  (testing "program source recurses via evaluate-program callback"
    (let [rt           (runtime/build-runtime meta/metadata-provider)
          inner-result {:result :from-inner-program}
          evaluate-fn  (fn [_path program]
                         (when (= {:source {:type "context" :ref "source"}
                                   :operations [["limit" 5]]}
                                  program)
                           inner-result))
          result       (source/resolve-source evaluate-fn rt [:source]
                                              {:type    "program"
                                               :program {:source     {:type "context" :ref "source"}
                                                         :operations [["limit" 5]]}})]
      (is (= inner-result result)))))

(ns metabase.query-processor.middleware.limit-test
  "Tests for the `:limit` clause and `:max-results` constraints."
  (:require
   [clojure.test :refer :all]
   [metabase.query-processor.interface :as qp.i]
   [metabase.query-processor.middleware.limit :as limit]
   [metabase.query-processor.reducible :as qp.reducible]
   [metabase.test :as mt]))

(def ^:private test-max-results 10000)

(defn- limit [query]
  (with-redefs [qp.i/absolute-max-results test-max-results]
    (let [rff (limit/limit-result-rows query qp.reducible/default-rff)
          rf  (rff {})]
      (transduce identity rf (repeat (inc test-max-results) [:ok])))))

(deftest limit-results-rows-test
  (testing "Apply to an infinite sequence and make sure it gets capped at `qp.i/absolute-max-results`"
    (is (= test-max-results
           (-> (limit {:type :native}) mt/rows count)))))

(deftest ^:parallel disable-max-results-test
  (testing "Apply `absolute-max-results` limit in the default case"
    (let [query {:type :query
                 :query {}}]
      (is (= {:type  :query
              :query {:limit                qp.i/absolute-max-results
                      ::limit/original-limit nil}}
             (limit/add-default-limit query)))))
  (testing "Don't apply the `absolute-max-results` limit when `disable-max-results` is used."
    (let [query (limit/disable-max-results {:type :query
                                            :query {}})]
      (is (= query
             (limit/add-default-limit query))))))

(deftest max-results-constraint-test
  (testing "Apply an arbitrary max-results on the query and ensure our results size is appropriately constrained"
    (is (= 1234
           (-> (limit {:constraints {:max-results 1234}
                       :type        :query
                       :query       {:aggregation [[:count]]}})
               mt/rows count)))))

(deftest no-aggregation-test
  (testing "Apply a max-results-bare-rows limit specifically on no-aggregation query"
    (let [query  {:constraints {:max-results 46}
                  :type        :query
                  :query       {}}
          result (limit query)]
      (is (= 46
             (-> result mt/rows count))
          "number of rows in results should match limit added by middleware")
      (is (= 46
             (:row_count result))
          ":row_count should match the limit added by middleware")
      (is (= {:constraints {:max-results 46}
              :type        :query
              :query       {:limit                 46
                            ::limit/original-limit nil}}
             (#'limit/add-default-limit query))
          "Preprocessed query should have :limit added to it"))))

(deftest ^:parallel download-row-max-results-test
  (testing "Apply `absolute-max-results` when `download-row-limit` is not set."
    (let [query {:type  :query
                 :query {}
                 :info  {:context :csv-download}}]
      (is (= {:type  :query
              :query {:limit                 qp.i/absolute-max-results
                      ::limit/original-limit nil}
              :info  {:context :csv-download}}
              (limit/add-default-limit query))))))

(deftest download-row-limit-test
  (testing "Apply custom download row limits when"
    (doseq [[limit expected context] [[1000 1000 :csv-download]
                                      [1000 1000 :json-download]
                                      [1000 1000 :xlsx-download]
                                      [1100000 1100000 :csv-download]
                                      [1100000 1100000 :json-download]
                                      [1100000 qp.i/absolute-max-results :xlsx-download]
                                      [nil qp.i/absolute-max-results :csv-download]
                                      [nil qp.i/absolute-max-results :json-download]
                                      [nil qp.i/absolute-max-results :xlsx-download]]]
      (testing (format "%s the absolute limit for %s"
                       (if (< expected qp.i/absolute-max-results)
                         "below"
                         "above")
                       context)
          (mt/with-temp-env-var-value! [mb-download-row-limit limit]
            (is (= expected
                   (get-in (limit/add-default-limit
                            {:type  :query
                             :query {}
                             :info  {:context context}})
                           [:query :limit])))))))
  (testing "Apply appropriate maximum when download-row-limit is unset, but `(mbql.u/query->max-rows-limit query)` returns a value above absolute-max-results"
    (doseq [[limit expected context] [[1000 1000 :csv-download]
                                      [1000 1000 :json-download]
                                      [1000 1000 :xlsx-download]
                                      [1100000 1100000 :csv-download]
                                      [1100000 1100000 :json-download]
                                      [1100000 qp.i/absolute-max-results :xlsx-download]]]
      (testing (format "%s the absolute limit for %s"
                       (if (< expected qp.i/absolute-max-results)
                         "below"
                         "above")
                       context)
          (is (= expected
                 (get-in (limit/add-default-limit
                          {:type        :query
                           :query       {}
                           ;; setting a constraint here will result in `(mbql.u/query->max-rows-limit query)` returning that limit
                           ;; so we can use this to check the behaviour of `limit/add-default-limit` when download-row-limit is unset
                           :constraints (when limit {:max-results-bare-rows limit})
                           :info        {:context context}})
                         [:query :limit])))))))

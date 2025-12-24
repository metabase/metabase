(ns metabase.query-processor.middleware.limit-test
  "Tests for the `:limit` clause and `:max-results` constraints."
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.query-processor.middleware.limit :as limit]
   [metabase.query-processor.reducible :as qp.reducible]
   [metabase.query-processor.settings :as qp.settings]
   [metabase.test :as mt]))

(def ^:private test-max-results 10000)

(defn- limit! [query]
  (if (:lib/type query)
    (with-redefs [qp.settings/absolute-max-results test-max-results]
      (let [rff (limit/limit-result-rows query qp.reducible/default-rff)
            rf  (rff {})]
        (transduce identity rf (repeat (inc test-max-results) [:ok]))))
    (recur (lib/query meta/metadata-provider query))))

(defn- add-default-limit [query]
  (if (:lib/type query)
    (limit/add-default-limit query)
    (-> (lib/query meta/metadata-provider query)
        limit/add-default-limit
        lib/->legacy-MBQL)))

(deftest limit-results-rows-test
  (testing "Apply to an infinite sequence and make sure it gets capped at `qp.settings/absolute-max-results`"
    (is (= test-max-results
           (-> (limit! {:type :native, :native {:query "SELECT 1;"}}) mt/rows count)))))

(deftest ^:parallel disable-max-results-test
  (testing "Apply `absolute-max-results` limit in the default case"
    (let [query {:database (meta/id)
                 :type     :query
                 :query    {:source-table (meta/id :venues)}}]
      (is (= {:database (meta/id)
              :type     :query
              :query    {:source-table (meta/id :venues)
                         :limit        qp.settings/absolute-max-results}}
             (add-default-limit query))))))

(deftest ^:parallel disable-max-results-test-2
  (testing "Don't apply the `absolute-max-results` limit when `disable-max-results` is used."
    (let [query (limit/disable-max-results {:database (meta/id)
                                            :type     :query
                                            :query    {:source-table (meta/id :venues)}})]
      (is (= query
             (add-default-limit query))))))

(deftest max-results-constraint-test
  (testing "Apply an arbitrary max-results on the query and ensure our results size is appropriately constrained"
    (is (= 1234
           (-> (limit! {:constraints {:max-results 1234}
                        :type        :query
                        :query       {:source-table 1234
                                      :aggregation  [[:count]]}})
               mt/rows count)))))

(deftest no-aggregation-test
  (testing "Apply a max-results-bare-rows limit specifically on no-aggregation query"
    (let [query  {:constraints {:max-results 46}
                  :type        :query
                  :query       {:source-table 1}}
          result (limit! query)]
      (is (= 46
             (-> result mt/rows count))
          "number of rows in results should match limit added by middleware")
      (is (= 46
             (:row_count result))
          ":row_count should match the limit added by middleware")
      (is (=? {:constraints {:max-results 46}
               :type        :query
               :query       {:limit 46}}
              (#'add-default-limit query))
          "Preprocessed query should have :limit added to it"))))

(deftest ^:parallel download-row-max-results-test
  (testing "Apply `absolute-max-results` when `download-row-limit` is not set."
    (let [query {:type  :query
                 :query {:source-table (meta/id :venues)}
                 :info  {:context :csv-download}}]
      (is (=? {:type     :query
               :query    {:limit qp.settings/absolute-max-results}
               :info     {:context :csv-download}}
              (add-default-limit query))))))

(deftest download-row-limit-test
  (testing "Apply custom download row limits when"
    (doseq [[limit expected context] [[1100000 1100000 :csv-download]
                                      [1100000 1100000 :json-download]
                                      [1100000 qp.settings/absolute-max-results :xlsx-download]
                                      [nil qp.settings/absolute-max-results :csv-download]
                                      [nil qp.settings/absolute-max-results :json-download]
                                      [nil qp.settings/absolute-max-results :xlsx-download]]]
      (testing (format "%s the absolute limit for %s"
                       (if (< expected qp.settings/absolute-max-results)
                         "below"
                         "above")
                       context)
        (mt/with-temp-env-var-value! [mb-download-row-limit limit]
          (is (= expected
                 (get-in (add-default-limit
                          {:type  :query
                           :query {:source-table (meta/id :venues)}
                           :info  {:context context}})
                         [:query :limit]))))))))

(deftest ^:parallel download-row-limit-test-2
  (testing "Apply appropriate maximum when download-row-limit is unset, but `(mbql.u/query->max-rows-limit query)` returns a value above absolute-max-results"
    (doseq [[limit expected context] [[1000 1000 :csv-download]
                                      [1000 1000 :json-download]
                                      [1000 1000 :xlsx-download]
                                      [1100000 1100000 :csv-download]
                                      [1100000 1100000 :json-download]
                                      [1100000 qp.settings/absolute-max-results :xlsx-download]]]
      (testing (format "%s the absolute limit for %s"
                       (if (< expected qp.settings/absolute-max-results)
                         "below"
                         "above")
                       context)
        (is (= expected
               (get-in (add-default-limit
                        {:type        :query
                         :query       {:source-table (meta/id :venues)}
                           ;; setting a constraint here will result in `(mbql.u/query->max-rows-limit query)` returning that limit
                           ;; so we can use this to check the behaviour of `add-default-limit` when download-row-limit is unset
                         :constraints (when limit {:max-results-bare-rows limit})
                         :info        {:context context}})
                       [:query :limit])))))))

(deftest embedded-download-row-limit-test
  (testing "Apply custom download row limits for embedded contexts"
    (doseq [[limit expected context] [[1100000 1100000 :embedded-csv-download]
                                      [1100000 1100000 :embedded-json-download]
                                      [1100000 qp.settings/absolute-max-results :embedded-xlsx-download]
                                      [nil qp.settings/absolute-max-results :embedded-csv-download]
                                      [nil qp.settings/absolute-max-results :embedded-json-download]
                                      [nil qp.settings/absolute-max-results :embedded-xlsx-download]]]
      (testing (format "%s the absolute limit for %s"
                       (if (< expected qp.settings/absolute-max-results)
                         "below"
                         "above")
                       context)
        (mt/with-temp-env-var-value! [mb-download-row-limit limit]
          (is (= expected
                 (get-in (add-default-limit
                          {:type  :query
                           :query {:source-table (meta/id :venues)}
                           :info  {:context context}})
                         [:query :limit]))))))))

(deftest public-download-row-limit-test
  (testing "Apply custom download row limits for public contexts"
    (doseq [[limit expected context] [[1100000 1100000 :public-csv-download]
                                      [1100000 1100000 :public-json-download]
                                      [1100000 qp.settings/absolute-max-results :public-xlsx-download]
                                      [nil qp.settings/absolute-max-results :public-csv-download]
                                      [nil qp.settings/absolute-max-results :public-json-download]
                                      [nil qp.settings/absolute-max-results :public-xlsx-download]]]
      (testing (format "%s the absolute limit for %s"
                       (if (< expected qp.settings/absolute-max-results)
                         "below"
                         "above")
                       context)
        (mt/with-temp-env-var-value! [mb-download-row-limit limit]
          (is (= expected
                 (get-in (add-default-limit
                          {:type  :query
                           :query {:source-table (meta/id :venues)}
                           :info  {:context context}})
                         [:query :limit]))))))))

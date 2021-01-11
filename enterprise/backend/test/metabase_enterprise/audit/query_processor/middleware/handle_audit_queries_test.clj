(ns metabase-enterprise.audit.query-processor.middleware.handle-audit-queries-test
  "Additional tests for this namespace can be found in `metabase-enterprise.audit.pages-test`."
  (:require [clojure.test :refer :all]
            [metabase.public-settings.metastore-test :as metastore-test]
            [metabase.query-processor :as qp]
            [metabase.test :as mt]))

(defn- run-query
  [varr & {:as additional-query-params}]
  (mt/with-test-user :crowberto
    (metastore-test/with-metastore-token-features #{:audit-app}
      (qp/process-query (merge {:type :internal
                                :fn   (let [mta (meta varr)]
                                        (format "%s/%s" (ns-name (:ns mta)) (:name mta)))}
                               additional-query-params)))))

(defn- ^:private ^:internal-query-fn legacy-format-query-fn
  [a1]
  {:metadata [[:a {:display_name "A", :base_type :type/DateTime}]
              [:b {:display_name "B", :base_type :type/Integer}]]
   :results  [{:a a1, :b 2}
              {:a 3, :b 5}]})

(defn- ^:private ^:internal-query-fn reducible-format-query-fn
  [a1]
  {:metadata [[:a {:display_name "A", :base_type :type/DateTime}]
              [:b {:display_name "B", :base_type :type/Integer}]]
   :results  (constantly [[a1 2]
                          [3 5]])
   :xform    (map #(update (vec %) 0 inc))})

(deftest transform-results-test
  (testing "Make sure query function result are transformed to QP results correctly"
    (doseq [[format-name {:keys [varr expected-rows]}] {"legacy"    {:varr          #'legacy-format-query-fn
                                                                     :expected-rows [[100 2] [3 5]]}
                                                        "reducible" {:varr          #'reducible-format-query-fn
                                                                     :expected-rows [[101 2] [4 5]]}}]
      (testing (format "format = %s" format-name)
        (let [results (delay (run-query varr :args [100]))]
          (testing "cols"
            (is (= [{:display_name "A", :base_type :type/DateTime, :name "a"}
                    {:display_name "B", :base_type :type/Integer, :name "b"}]
                   (mt/cols @results))))
          (testing "rows"
            (is (= expected-rows
                   (mt/rows @results)))))))))

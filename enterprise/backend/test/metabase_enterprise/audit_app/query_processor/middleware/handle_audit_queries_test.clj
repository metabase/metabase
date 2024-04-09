(ns ^:mb/once metabase-enterprise.audit-app.query-processor.middleware.handle-audit-queries-test
  "Additional tests for this namespace can be found in `metabase-enterprise.audit-app.pages-test`."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.audit-app.interface :as audit.i]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.util :as u]))

(defn- run-query
  [query-type & {:as additional-query-params}]
  (mt/with-test-user :crowberto
    (mt/with-premium-features #{:audit-app}
      (qp/process-query (merge {:type :internal
                                :fn   (u/qualified-name query-type)}
                               additional-query-params)))))

(defmethod audit.i/internal-query ::legacy-format-query-fn
  [_ a1]
  {:metadata [[:a {:display_name "A", :base_type :type/DateTime}]
              [:b {:display_name "B", :base_type :type/Integer}]]
   :results  [{:a a1, :b 2}
              {:a 3, :b 5}]})

(defmethod audit.i/internal-query ::reducible-format-query-fn
  [_ a1]
  {:metadata [[:a {:display_name "A", :base_type :type/DateTime}]
              [:b {:display_name "B", :base_type :type/Integer}]]
   :results  (constantly [[a1 2]
                          [3 5]])
   :xform    (map #(update (vec %) 0 inc))})

(deftest ^:parallel transform-results-test
  (testing "Make sure query function result are transformed to QP results correctly"
    (doseq [[format-name {:keys [query-type expected-rows]}] {"legacy"    {:query-type    ::legacy-format-query-fn
                                                                           :expected-rows [[100 2] [3 5]]}
                                                              "reducible" {:query-type    ::reducible-format-query-fn
                                                                           :expected-rows [[101 2] [4 5]]}}]
      (testing (format "format = %s" format-name)
        (let [results (delay (run-query query-type :args [100]))]
          (testing "cols"
            (is (= [{:display_name "A", :base_type :type/DateTime, :name "a"}
                    {:display_name "B", :base_type :type/Integer, :name "b"}]
                   (mt/cols @results))))
          (testing "rows"
            (is (= expected-rows
                   (mt/rows @results)))))))))

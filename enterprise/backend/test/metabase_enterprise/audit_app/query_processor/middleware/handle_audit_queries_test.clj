(ns metabase-enterprise.audit-app.query-processor.middleware.handle-audit-queries-test
  "Additional tests for this namespace can be found in `metabase-enterprise.audit-app.pages-test`."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.audit-app.interface :as audit.i]
   [metabase-enterprise.audit-app.query-processor.middleware.handle-audit-queries :as qp.middleware.audit]
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

(deftest ^:parallel validate-internal-query-test
  (testing "InternalQuery is enforced by a plain fn that runs in production builds too, not by a mu/defn arg schema"
    (testing "a declared query passes"
      (is (nil? (#'qp.middleware.audit/validate-internal-query
                 {:type :internal
                  :fn   "metabase-enterprise.audit-app.pages.queries/bad-table"
                  :args ["" "" "" "card_name" "asc"]}))))
    (testing "an undeclared arg shape does not"
      (doseq [args [["" "" "" "u.password" "asc"]   ; sort-column reaches an ORDER BY identifier
                    ["" "" "" "%now" "asc"]         ; where a leading % is read as a function call
                    ["" "" "" "card_name" "asc; --"]]]
        (testing (pr-str args)
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"Invalid internal query"
               (#'qp.middleware.audit/validate-internal-query
                {:type :internal
                 :fn   "metabase-enterprise.audit-app.pages.queries/bad-table"
                 :args args}))))))))

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

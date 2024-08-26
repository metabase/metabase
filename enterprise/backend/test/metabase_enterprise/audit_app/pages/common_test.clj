(ns ^:mb/once metabase-enterprise.audit-app.pages.common-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.audit-app.interface :as audit.i]
   [metabase-enterprise.audit-app.pages.common :as common]
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
   :results  (common/query
              {:union-all [{:select [[[:inline a1] :A]
                                     [[:inline 2] :B]]}
                           {:select [[[:inline 3] :A]
                                     [[:inline 4] :B]]}]})})

(defmethod audit.i/internal-query ::reducible-format-query-fn
  [_ a1]
  {:metadata [[:a {:display_name "A", :base_type :type/DateTime}]
              [:b {:display_name "B", :base_type :type/Integer}]]
   :results  (common/reducible-query
              {:union-all [{:select [[[:inline a1] :A]
                                     [[:inline 2] :B]]}
                           {:select [[[:inline 3] :A]
                                     [[:inline 4] :B]]}]})
   :xform    (map #(update (vec %) 0 inc))})

(deftest transform-results-test
  (testing "Make sure query function result are transformed to QP results correctly"
    (mt/with-premium-features #{:audit-app}
      (doseq [[format-name {:keys [query-type expected-rows]}] {"legacy"    {:query-type    ::legacy-format-query-fn
                                                                             :expected-rows [[100 2] [3 4]]}
                                                                "reducible" {:query-type    ::reducible-format-query-fn
                                                                             :expected-rows [[101 2] [4 4]]}}]
        (testing (format "format = %s" format-name)
          (let [results (delay (run-query query-type :args [100]))]
            (testing "cols"
              (is (= [{:display_name "A", :base_type :type/DateTime, :name "a"}
                      {:display_name "B", :base_type :type/Integer, :name "b"}]
                     (mt/cols @results))))
            (testing "rows"
              (is (= expected-rows
                     (mt/rows @results))))))))))

(deftest ^:parallel add-search-clause-test
  (testing "add search clause"
    (is (= {:where [:or
                    [:like [:lower :t.name] "%birds%"]
                    [:like [:lower :db.name] "%birds%"]]}
           (#'common/add-search-clause {} "birds" :t.name :db.name)))))

(deftest query-limit-and-offset-test
  (testing "Make sure params passed in as part of the query map are respected"
    (mt/with-premium-features #{:audit-app}
      (doseq [[format-name {:keys [query-type expected-rows]}] {"legacy"    {:query-type    ::legacy-format-query-fn
                                                                             :expected-rows [[100 2] [3 4]]}
                                                                "reducible" {:query-type    ::reducible-format-query-fn
                                                                             :expected-rows [[101 2] [4 4]]}}]
        (testing (format "format = %s" format-name)
          (testing :limit
            (is (= [(first expected-rows)]
                   (mt/rows (run-query query-type :args [100], :limit 1)))))
          (testing :offset
            (is (= [(second expected-rows)]
                   (mt/rows (run-query query-type :args [100], :offset 1))))))))))

(deftest ^:parallel CTES->subselects-test
  (testing "FROM substitution"
    (is (= {:from [[{:from [[:view_log :vl]]} :mp]]}
           (#'common/CTEs->subselects
            {:with [[:most_popular {:from [[:view_log :vl]]}]]
             :from [[:most_popular :mp]]}))))

  (testing "JOIN substitution"
    (is (= {:left-join [[{:from [[:query_execution :qe]]} :qe_count] [:= :qe_count.executor_id :u.id]]}
           (#'common/CTEs->subselects
            {:with      [[:qe_count {:from [[:query_execution :qe]]}]]
             :left-join [:qe_count [:= :qe_count.executor_id :u.id]]}))))

  (testing "IN subselect substitution"
    (is (= {:from [[{:from  [[:report_dashboardcard :dc]]
                     :where [:in :d.id {:from [[{:from [[:view_log :vl]]} :most_popular]]}]} :dash_avg_running_time]]}
           (#'common/CTEs->subselects
            {:with [[:most_popular {:from [[:view_log :vl]]}]
                    [:dash_avg_running_time {:from  [[:report_dashboardcard :dc]]
                                             :where [:in :d.id {:from [:most_popular]}]}]]
             :from [:dash_avg_running_time]}))))

  (testing "putting it all together"
    (is (= {:select    [:mp.dashboard_id]
            :from      [[{:select    [[:d.id :dashboard_id]]
                          :from      [[:view_log :vl]]
                          :left-join [[:report_dashboard :d] [:= :vl.model_id :d.id]]} :mp]]
            :left-join [[{:select    [[:d.id :dashboard_id]]
                          :from      [[:report_dashboardcard :dc]]
                          :left-join [[{:select [:qe.card_id]
                                        :from   [[:query_execution :qe]]} :rt]
                                      [:= :dc.card_id :rt.card_id]

                                      [:report_dashboard :d]
                                      [:= :dc.dashboard_id :d.id]]
                          :where [:in :d.id {:select [:dashboard_id]
                                             :from   [[{:select    [[:d.id :dashboard_id]]
                                                        :from      [[:view_log :vl]]
                                                        :left-join [[:report_dashboard :d]
                                                                    [:= :vl.model_id :d.id]]} :most_popular]]}]} :rt]
                        [:= :mp.dashboard_id :rt.dashboard_id]]}
           (#'common/CTEs->subselects
            {:with      [[:most_popular {:select    [[:d.id :dashboard_id]]
                                         :from      [[:view_log :vl]]
                                         :left-join [[:report_dashboard :d] [:= :vl.model_id :d.id]]}]
                         [:card_running_time {:select [:qe.card_id]
                                              :from   [[:query_execution :qe]]}]
                         [:dash_avg_running_time {:select    [[:d.id :dashboard_id]]
                                                  :from      [[:report_dashboardcard :dc]]
                                                  :left-join [[:card_running_time :rt] [:= :dc.card_id :rt.card_id]
                                                              [:report_dashboard :d]   [:= :dc.dashboard_id :d.id]]
                                                  :where     [:in :d.id {:select [:dashboard_id]
                                                                         :from   [:most_popular]}]}]]
             :select    [:mp.dashboard_id]
             :from      [[:most_popular :mp]]
             :left-join [[:dash_avg_running_time :rt] [:= :mp.dashboard_id :rt.dashboard_id]]})))))

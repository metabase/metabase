(ns metabase-enterprise.audit.pages.common-test
  (:require [clojure.test :refer :all]
            [metabase-enterprise.audit.pages.common :as pages.common]
            [metabase.db :as mdb]
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
  (let [h2? (= (mdb/db-type) :h2)]
    {:metadata [[:A {:display_name "A", :base_type :type/DateTime}]
                [:B {:display_name "B", :base_type :type/Integer}]]
     :results  (pages.common/query
                {:union-all [{:select [[a1 :A] [2 :B]]}
                             {:select [[3 :A] [4 :B]]}]})}))

(defn- ^:private ^:internal-query-fn reducible-format-query-fn
  [a1]
  {:metadata [[:A {:display_name "A", :base_type :type/DateTime}]
              [:B {:display_name "B", :base_type :type/Integer}]]
   :results  (pages.common/reducible-query
              {:union-all [{:select [[a1 :A] [2 :B]]}
                           {:select [[3 :A] [4 :B]]}]})
   :xform    (map #(update (vec %) 0 inc))})

(deftest transform-results-test
  (testing "Make sure query function result are transformed to QP results correctly"
    (metastore-test/with-metastore-token-features #{:audit-app}
      (doseq [[format-name {:keys [varr expected-rows]}] {"legacy"    {:varr          #'legacy-format-query-fn
                                                                       :expected-rows [[100 2] [3 4]]}
                                                          "reducible" {:varr          #'reducible-format-query-fn
                                                                       :expected-rows [[101 2] [4 4]]}}]
        (testing (format "format = %s" format-name)
          (let [results (delay (run-query varr :args [100]))]
            (testing "cols"
              (is (= [{:display_name "A", :base_type :type/DateTime, :name "A"}
                      {:display_name "B", :base_type :type/Integer, :name "B"}]
                     (mt/cols @results))))
            (testing "rows"
              (is (= expected-rows
                     (mt/rows @results))))))))))

(deftest query-limit-and-offset-test
  (testing "Make sure params passed in as part of the query map are respected"
    (metastore-test/with-metastore-token-features #{:audit-app}
      (doseq [[format-name {:keys [varr expected-rows]}] {"legacy"    {:varr          #'legacy-format-query-fn
                                                                       :expected-rows [[100 2] [3 4]]}
                                                          "reducible" {:varr          #'reducible-format-query-fn
                                                                       :expected-rows [[101 2] [4 4]]}}]
        (testing (format "format = %s" format-name)
          (testing :limit
            (is (= [(first expected-rows)]
                   (mt/rows (run-query varr :args [100], :limit 1)))))
          (testing :offset
            (is (= [(second expected-rows)]
                   (mt/rows (run-query varr :args [100], :offset 1))))))))))

(deftest CTES->subselects-test
  (testing "FROM substitution"
    (is (= {:from [[{:from [[:view_log :vl]]} :mp]]}
           (#'pages.common/CTEs->subselects
            {:with      [[:most_popular {:from [[:view_log :vl]]}]]
             :from      [[:most_popular :mp]]}))))

  (testing "JOIN substitution"
    (is (= {:left-join [[{:from [[:query_execution :qe]]} :qe_count] [:= :qe_count.executor_id :u.id]]}
           (#'pages.common/CTEs->subselects
            {:with      [[:qe_count {:from [[:query_execution :qe]]}]]
             :left-join [:qe_count [:= :qe_count.executor_id :u.id]]}))))

  (testing "IN subselect substitution"
    (is (= {:from [[{:from  [[:report_dashboardcard :dc]]
                     :where [:in :d.id {:from [[{:from [[:view_log :vl]]} :most_popular]]}]} :dash_avg_running_time]]}
           (#'pages.common/CTEs->subselects
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
                          :where     [:in :d.id {:select [:dashboard_id]
                                                 :from   [[{:select    [[:d.id :dashboard_id]]
                                                            :from      [[:view_log :vl]]
                                                            :left-join [[:report_dashboard :d]
                                                                        [:= :vl.model_id :d.id]]} :most_popular]]}]} :rt]
                        [:= :mp.dashboard_id :rt.dashboard_id]]}
           (#'pages.common/CTEs->subselects
            {:with      [[:most_popular {:select    [[:d.id :dashboard_id]]
                                         :from      [[:view_log :vl]]
                                         :left-join [[:report_dashboard :d] [:= :vl.model_id :d.id]]}]
                         [:card_running_time {:select [:qe.card_id]
                                              :from   [[:query_execution :qe]]}]
                         [:dash_avg_running_time {:select    [[:d.id :dashboard_id] ]
                                                  :from      [[:report_dashboardcard :dc]]
                                                  :left-join [[:card_running_time :rt] [:= :dc.card_id :rt.card_id]
                                                              [:report_dashboard :d]   [:= :dc.dashboard_id :d.id]]
                                                  :where     [:in :d.id {:select [:dashboard_id]
                                                                         :from   [:most_popular]}]}]]
             :select    [:mp.dashboard_id]
             :from      [[:most_popular :mp]]
             :left-join [[:dash_avg_running_time :rt] [:= :mp.dashboard_id :rt.dashboard_id]]})))))

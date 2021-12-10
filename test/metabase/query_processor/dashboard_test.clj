(ns metabase.query-processor.dashboard-test
  "There are a lot of additional tests in [[metabase.api.dashboard-test]]"
  (:require [clojure.test :refer :all]
            [metabase.api.common :as api]
            [metabase.models :refer [Card Dashboard DashboardCard]]
            [metabase.query-processor :as qp]
            [metabase.query-processor.dashboard :as qp.dashboard]
            [metabase.test :as mt]
            [schema.core :as s]))

(deftest merge-defaults-from-mappings-test
  (testing "DashboardCard parameter mappings can specify default values, and we should respect those"
    (mt/with-temp* [Card [{card-id :id} {:dataset_query {:database (mt/id)
                                                         :type     :native
                                                         :native   {:query         "SELECT {{x}}"
                                                                    :template-tags {"x" {:id           "abc"
                                                                                         :name         "x"
                                                                                         :display-name "X"
                                                                                         :type         :number
                                                                                         :required     true}}}}}]
                    ;; `:name` doesn't matter for Dashboard parameter mappings.
                    Dashboard [{dashboard-id :id} {:parameters [{:name    "A_DIFFERENT_X"
                                                                 :slug    "x_slug"
                                                                 :id      "__X__"
                                                                 :type    :category
                                                                 :default 3}]}]
                    DashboardCard [_ {:card_id            card-id
                                      :dashboard_id       dashboard-id
                                      :parameter_mappings [{:parameter_id "__X__"
                                                            :card_id      card-id
                                                            :target       [:variable [:template-tag "x"]]}]}]]
      (testing "param resolution code should include default values"
        (is (schema= [(s/one
                       {:type     (s/eq "category")
                        :id       (s/eq "__X__")
                        :default  (s/eq 3)
                        :target   (s/eq [:variable [:template-tag "x"]])
                        s/Keyword s/Any}
                       "parameter")]
                     (#'qp.dashboard/resolve-params-for-query dashboard-id card-id nil))))
      (testing "make sure it works end-to-end"
        (binding [api/*current-user-permissions-set* (atom #{"/"})]
          (is (schema= {:status   (s/eq :completed)
                        :data     {:rows     (s/eq [[3]])
                                   s/Keyword s/Any}
                        s/Keyword s/Any}
                       (qp.dashboard/run-query-for-dashcard-async
                        :dashboard-id dashboard-id
                        :card-id      card-id
                        :run          (fn [query info]
                                        (qp/process-query (assoc query :async? false) info))))))))))

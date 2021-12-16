(ns metabase.query-processor.dashboard-test
  "There are a lot of additional tests in [[metabase.api.dashboard-test]]"
  (:require [clojure.test :refer :all]
            [metabase.api.common :as api]
            [metabase.models :refer [Card Dashboard DashboardCard]]
            [metabase.query-processor :as qp]
            [metabase.query-processor.card-test :as qp.card-test]
            [metabase.query-processor.dashboard :as qp.dashboard]
            [metabase.test :as mt]
            [schema.core :as s]))

(defn- run-query-for-dashcard [dashboard-id card-id & options]
  ;; TODO -- we shouldn't do the perms checks if there is no current User context. It seems like API-level perms check
  ;; stuff doesn't belong in the Dashboard QP namespace
  (binding [api/*current-user-permissions-set* (atom #{"/"})]
    (apply qp.dashboard/run-query-for-dashcard-async
     :dashboard-id dashboard-id
     :card-id      card-id
     :run          (fn [query info]
                     (qp/process-query (assoc query :async? false) info))
     options)))

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
        (is (schema= {:status   (s/eq :completed)
                      :data     {:rows     (s/eq [[3]])
                                 s/Keyword s/Any}
                      s/Keyword s/Any}
                     (run-query-for-dashcard dashboard-id card-id)))))))

(deftest default-value-precedence-test-field-filters
  (testing "If both Dashboard and Card have default values for a Field filter parameter, Card defaults should take precedence\n"
    (mt/dataset sample-dataset
      (mt/with-temp* [Card [{card-id :id} {:dataset_query {:database (mt/id)
                                                           :type     :native
                                                           :native   {:query (str "SELECT distinct category "
                                                                                  "FROM products "
                                                                                  "WHERE {{filter}} "
                                                                                  "ORDER BY category ASC")
                                                                      :template-tags
                                                                      {"filter"
                                                                       {:id           "xyz456"
                                                                        :name         "filter"
                                                                        :display-name "Filter"
                                                                        :type         :dimension
                                                                        :dimension    [:field (mt/id :products :category) nil]
                                                                        :widget-type  :category
                                                                        :default      ["Gizmo" "Gadget"]
                                                                        :required     true}}}}}]
                      Dashboard [{dashboard-id :id} {:parameters [{:name    "category"
                                                                   :slug    "category"
                                                                   :id      "abc123"
                                                                   :type    :string/=
                                                                   :default ["Widget"]}]}]
                      DashboardCard [_ {:dashboard_id       dashboard-id
                                        :card_id            card-id
                                        :parameter_mappings [{:parameter_id "abc123"
                                                              :card_id      card-id
                                                              :target       [:dimension [:template-tag "filter"]]}]}]]
        (testing "Sanity check: running Card query should use Card defaults"
          (is (= [["Gadget"] ["Gizmo"]]
                 (mt/rows (qp.card-test/run-query-for-card card-id)))))
        (testing "No value specified: should prefer Card defaults"
          (is (= [["Gadget"] ["Gizmo"]]
                 (mt/rows (run-query-for-dashcard dashboard-id card-id)))))
        (testing "Specifying a value should override both defaults."
          (is (= [["Doohickey"]]
                 (mt/rows (run-query-for-dashcard
                           dashboard-id card-id
                           :parameters [{:id    "abc123"
                                         :value ["Doohickey"]}])))))))))

(deftest default-value-precedence-test-raw-values
  (testing "If both Dashboard and Card have default values for a raw value parameter, Card defaults should take precedence\n"
    (mt/dataset sample-dataset
      (mt/with-temp* [Card [{card-id :id} {:dataset_query {:database (mt/id)
                                                           :type     :native
                                                           :native   {:query "SELECT {{filter}}"
                                                                      :template-tags
                                                                      {"filter"
                                                                       {:id           "f0774ef5-a14a-e181-f557-2d4bb1fc94ae"
                                                                        :name         "filter"
                                                                        :display-name "Filter"
                                                                        :type         :text
                                                                        :required     true
                                                                        :default      "Foo"}}}}}]
                      Dashboard [{dashboard-id :id} {:parameters [{:name    "Text"
                                                                   :slug    "text"
                                                                   :id      "5791ff38"
                                                                   :type    :string/=
                                                                   :default "Bar"}]}]
                      DashboardCard [_ {:dashboard_id       dashboard-id
                                        :card_id            card-id
                                        :parameter_mappings [{:parameter_id "5791ff38"
                                                              :card_id      card-id
                                                              :target       [:variable [:template-tag "filter"]]}]}]]
        (testing "Sanity check: running Card query should use Card defaults"
          (is (= [["Foo"]]
                 (mt/rows (qp.card-test/run-query-for-card card-id)))))
        (testing "No value specified: should prefer Card defaults"
          (is (= [["Foo"]]
                 (mt/rows (run-query-for-dashcard dashboard-id card-id)))))
        (testing "Specifying a value should override both defaults."
          (is (= [["Something Else"]]
                 (mt/rows (run-query-for-dashcard
                           dashboard-id card-id
                           :parameters [{:id    "5791ff38"
                                         :value ["Something Else"]}])))))))))

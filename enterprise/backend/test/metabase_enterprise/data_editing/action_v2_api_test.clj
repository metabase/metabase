(ns metabase-enterprise.data-editing.action-v2-api-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-editing.test-util :as data-editing.tu]
   [metabase.test :as mt]
   [metabase.util :as u]))

;; TODO High level stuff we should do:
;; 0. Make sure we have tests to cover every single step taken in our core user journeys.
;; 1. Cover :create-or-update as well.
;; 2. DRY up or otherwise streamline how we construct these scenarios - hard to see the forest for the boilerplate.
;; 3. Consolidate test cases between /config-form, /tmp-model, and /execute

;; Important missing tests
(comment
  configure-saved-action-on-editable-on-dashboard-test
  ;; either copy past tests or use a doseq to vary how we construct it
  configure-saved-action-on-question-on-dashboard-test
  configure-table-action-on-question-on-dashboard-test)

;; For example, when picking a model action to add as a row action, we call this for the initial config form.
(deftest configure-saved-query-action-test
  (let [req #(mt/user-http-request-full-response
              (:user % :crowberto)
              :post
              "action/v2/config-form"
              (select-keys % [:action_id
                              :scope
                              :input]))]
    (mt/with-premium-features #{:table-data-editing}
      (mt/test-drivers #{:h2 :postgres}
        (data-editing.tu/with-data-editing-enabled! true
          (testing "saved actions"
            (mt/with-non-admin-groups-no-root-collection-perms
              (mt/with-temp [:model/Table table {}
                             :model/Card model {:type     :model
                                                :table_id (:id table)}
                             :model/Action action {:type       :query
                                                   :name       "Do cool thing"
                                                   :model_id   (:id model)
                                                   :parameters [{:id   "random-a"
                                                                 :name "A"
                                                                 :type "number/="
                                                                 :slug "a"}
                                                                {:id   "random-b"
                                                                 :name "B"
                                                                 :type "date/single"
                                                                 :slug "b"}
                                                                {:id   "random-c"
                                                                 :name "C"
                                                                 :type "string/="
                                                                 :slug "c"}
                                                                {:id   "random-d"
                                                                 :name "D"
                                                                 :type "string/="
                                                                 :slug "d"}
                                                                {:id   "random-e"
                                                                 :name "E"
                                                                 :type "string/="
                                                                 :slug "e"}]
                                                   :visualization_settings
                                                   {:fields {"c" {:inputType "text"}
                                                             "e" {:valueOptions ["a" "b"]}}}}]
                (is (=? {:status 200
                         :body   {:title      "Do cool thing"
                                  ;; TODO this is the raw format we're currently saving config like
                                  ;;      but, we want to instead return "data components" which tell us how to *change* it
                                  ;;      and also... as part of introducing /config-form we are free to *change* how config is saved
                                  ;;      because it will now be encapsulated. we just need migrate on read to avoid breaking
                                  ;;      staging and beta users.
                                  ;;      for now it doesn't tell you the type or the possible values, BUT maybe we want the wrapping
                                  ;;      component to know that (it just doesn't get saved)
                                  :parameters [{:id "a", :sourceType "ask-user"}
                                               {:id "b", :sourceType "ask-user"}
                                               {:id "c", :sourceType "ask-user"}
                                               {:id "d", :sourceType "ask-user"}
                                               {:id "e", :sourceType "ask-user"}]}}
                        (req {:scope     {:model-id (:id model)
                                          :table-id (:id table)}
                              :action_id {:action-id (:id action)}})))))))))))

;; For example, when picking a model action to add as a row action, we call this for the initial config form.
(deftest configure-saved-implicit-action-test
  (mt/with-premium-features #{:table-data-editing}
    (mt/test-drivers #{:h2 :postgres}
      (data-editing.tu/with-data-editing-enabled! true
        (testing "saved actions"
          (let [expected-id-params  [{:id "id"         :sourceType "ask-user"}]
                expected-row-params [{:id "user_id"    :sourceType "ask-user"}
                                     {:id "product_id" :sourceType "ask-user"}
                                     {:id "subtotal"   :sourceType "ask-user"}
                                     {:id "tax"        :sourceType "ask-user"}
                                     {:id "total"      :sourceType "ask-user"}
                                     {:id "discount"   :sourceType "ask-user"}
                                     {:id "created_at" :sourceType "ask-user"}
                                     {:id "quantity"   :sourceType "ask-user"}]
                action-kind->expected-params {"row/create" expected-row-params
                                              "row/update" (concat expected-id-params expected-row-params)
                                              "row/delete" expected-id-params}]

            (doseq [[action-kind expected-params] action-kind->expected-params]
              (mt/with-actions [model {:type          :model
                                       :dataset_query (mt/mbql-query orders)}
                                {action-id :action-id} {:type :implicit
                                                        :kind action-kind
                                                        :name "Do cool thing"}]
                (is (= {:title      "Do cool thing"
                        :parameters expected-params}
                       (mt/user-http-request :crowberto :post 200 "action/v2/config-form"
                                             {:scope     {:model-id (:id model)
                                                          :table-id (mt/id :orders)}
                                              :action_id {:action-id action-id}})))))))))))

;; For example, when picking a table action to add as a row action, we call this for the initial config form.
(deftest configure-table-action-test
  (mt/with-premium-features #{:table-data-editing}
    (mt/test-drivers #{:h2 :postgres}
      (data-editing.tu/with-test-tables! [test-table [{:id        'auto-inc-type
                                                       :text      [:text]
                                                       :int       [:int]
                                                       :timestamp [:timestamp]
                                                       :date      [:date]}
                                                      {:primary-key [:id]}]]

        (let [;; TODO the form for configuring a row action will need to know that ID is meant to be "locked" to
              ;;      the pk of the table underlying the data-grid.
              expected-id-params   [{:id "id"        :sourceType "ask-user"}]
              expected-row-params  [{:id "text"      :sourceType "ask-user"}
                                    {:id "int"       :sourceType "ask-user"}
                                    {:id "timestamp" :sourceType "ask-user"}
                                    {:id "date"      :sourceType "ask-user"}]]

          (testing "table actions"
            (let [scope {:table-id test-table}
                  {create-id "table.row/create"
                   update-id "table.row/update"
                   delete-id "table.row/delete"} (->> (mt/user-http-request-full-response
                                                       :crowberto
                                                       :get
                                                       "action/v2/tmp-action")
                                                      :body :actions
                                                      (filter #(= test-table (:table_id %)))
                                                      (u/index-by :kind :id))]
              (testing "create"
                (is (=? {:title      (mt/malli=? :string)
                         :parameters expected-row-params}
                        (mt/user-http-request :crowberto :post 200 "action/v2/config-form"
                                              {:scope     scope
                                               :action_id create-id}))))
              (testing "update"
                (is (=? {:title      (mt/malli=? :string)
                         :parameters (concat expected-id-params expected-row-params)}
                        (mt/user-http-request :crowberto :post 200 "action/v2/config-form"
                                              {:scope     scope
                                               :action_id update-id}))))
              (testing "delete"
                (is (=? {:title      (mt/malli=? :string)
                         :parameters expected-id-params}
                        (mt/user-http-request :crowberto :post 200 "action/v2/config-form"
                                              {:scope     scope
                                               :action_id delete-id})))))))))))

;; This is the case where we are EDITING some kind of header or row action, for example.
;;
;; There are actually two different cases here:
;; 1. built-in actions (don't have their own configuration, but inherit parameter order from the Editable settings)
;; 2. custom actions (have their own configuration, but no inheritance (for now, Katya working on prod doc))
;;
;; Since we don't support configuration for (1) yet, this is only concerned with (2)
(deftest configure-table-action-on-editable-on-dashboard-test
  (let [req #(dissoc (mt/user-http-request-full-response
                      (:user % :crowberto)
                      :post
                      "action/v2/config-form"
                      (select-keys % [:action_id
                                      :scope
                                      :input]))
                     :headers)]
    (mt/with-premium-features #{:table-data-editing}
      (mt/test-drivers #{:h2 :postgres}
        (data-editing.tu/with-test-tables! [source-table [{:id        'auto-inc-type
                                                           :text      [:text]}
                                                          {:primary-key [:id]}]
                                            target-table [{:id        'auto-inc-type
                                                           :text      [:text]
                                                           :int       [:int]
                                                           :timestamp [:timestamp]
                                                           :date      [:date]}
                                                          {:primary-key [:id]}]]
          (let [action-id (->> (mt/user-http-request-full-response
                                :crowberto
                                :get
                                "action/v2/tmp-action")
                               :body :actions
                               (filter #(= target-table (:table_id %)))
                               (u/index-by :kind :id)
                               (#(get % "table.row/create")))]
            (mt/with-temp
              [:model/Dashboard dashboard {}
               :model/Card model {:type          :model
                                  :table_id      source-table
                                  :database_id   (mt/id)
                                  :dataset_query {:database (mt/id)
                                                  :type     :query
                                                  :query    {:source-table source-table}}}
               :model/DashboardCard dashcard {:dashboard_id (:id dashboard)
                                              :card_id      (:id model)
                                              :visualization_settings
                                              {:table_id source-table

                                              ;; The data-grid config is NOT inherited by custom actions (yet)
                                               :table.columns
                                               [{:name "int", :enabled true}
                                                {:name "text", :enabled true}
                                                {:name "timetamp", :enabled true}
                                               ;; this signals date should not be shown in the grid, or be available
                                               ;; to default actions.
                                                {:name "date", :enabled false}]

                                              ;; The data-grid config is NOT inherited by custom actions (yet)
                                               :editableTable.columns
                                               ["int"
                                               ;; this signals text is not editable by default actions
                                                #_"text"
                                                "timestamp"
                                                "date"]

                                               :editableTable.enabledActions
                                              ;; See [[metabase.dashboards.api/create-or-fix-action-id]] for why this is unknown.
                                               [{:id                "dashcard:unknown:built-in-update"
                                                 :actionId          "table.row/update"
                                                ;; TODO Katya calls these "default" actions, maybe we should rename to match?
                                                 :actionType        "data-grid/built-in"
                                                 :enabled           true
                                                ;; Not currently configurable.
                                                 :parameterMappings nil}
                                                {:id                "dashcard:unknown:update"
                                                 :actionId          action-id
                                                 :actionType        "data-grid/custom-action"
                                                 :enabled           true
                                                ;; TODO make sure this stuff makes sense.
                                                ;;      What does the FE really write? Have we messed anything up?
                                                ;;      Have we missed any cases?
                                                 :parameterMappings [{:parameterId       "id"
                                                                      :sourceType        "ask-user"}
                                                                     {:parameterId       "int"
                                                                      :sourceType        "constant"
                                                                      :value             42}
                                                                     {:parameterId       "text"
                                                                      :sourceType        "row-data"
                                                                      :sourceValueTarget "text"
                                                                      :visibility        "readonly"}
                                                                     {:parameterId       "timestamp"
                                                                      :visibility        "hidden"}]}]}}]
              ;; insert a row for the row action
              (mt/user-http-request :crowberto :post 200
                                    (data-editing.tu/table-url source-table)
                                    {:rows [{:text "a very important string"}]})

              (testing "default table action on a data-grid"
                (is (=? {:status 400}
                        (req {:action_id "dashcard:unknown:built-in-update"
                              :scope     {:dashcard-id (:id dashcard)}}))))

              (testing "custom table action on a data-grid"
                (is (=? {:status 200
                         :body   {:parameters
                                  [{:id "id",   :sourceType "ask-user"}
                                   {:id "int",  :sourceType "constant", :value 42}
                                   {:id "text", :sourceType "row-data", :sourceValueTarget "text", :visibility "readonly"}
                                   {:id "timestamp", :visibility "hidden"}
                                   {:id "date",      :sourceType "ask-user"}]}}
                        (req {:action_id "dashcard:unknown:update"
                              :scope     {:dashcard-id (:id dashcard)}})))))))))))

(deftest configure-saved-action-on-editable-on-dashboard-test
  (mt/with-premium-features #{:table-data-editing}
    (mt/test-drivers #{:h2 :postgres}
      (data-editing.tu/with-test-tables! [test-table [{:id        'auto-inc-type
                                                       :text      [:text]
                                                       :int       [:int]
                                                       :timestamp [:timestamp]
                                                       :date      [:date]}
                                                      {:primary-key [:id]}]]

        (mt/with-temp
          [:model/Dashboard     dash {}
           :model/Card          model     {:type           :model
                                           :table_id       test-table
                                           :database_id    (mt/id)
                                           :dataset_query  {:database (mt/id)
                                                            :type :query
                                                            :query {:source-table test-table}}}
           :model/Action        action   {:type           :query
                                          :name           "update"
                                          :model_id       (:id model)
                                          :parameters     [{:id "a"
                                                            :name "Id"
                                                            :slug "id"}
                                                           {:id "b"
                                                            :name "Name"
                                                            :slug "name"}
                                                           {:id "c"
                                                            :name "Status"
                                                            :slug "status"}]}
           :model/ImplicitAction _       {:action_id      (:id action)
                                          :kind           "row/update"}
           :model/DashboardCard dashcard  {:dashboard_id   (:id dash)
                                           :card_id        (:id model)
                                           :visualization_settings
                                           {:table_id test-table
                                            :editableTable.enabledActions
                                            [{:id                "dashcard:unknown:default"
                                              :actionId          (:id action)
                                              :actionType        "data-grid/custom-action"
                                              :enabled           true}
                                             {:id                "dashcard:unknown:configured"
                                              :actionId          (:id action)
                                              :actionType        "data-grid/custom-action"
                                              :parameterMappings [{:parameterId "id", :sourceType "ask-user"}
                                                                  ;; missing name
                                                                  {:parameterId "status", :sourceType "ask-user"}]
                                              :enabled           true}]}}]
          ;; insert a row for the row action
          (mt/user-http-request :crowberto :post 200
                                (data-editing.tu/table-url test-table)
                                {:rows [{:text "a very important string"}]})

          (testing "configure for unsaved action will contains all action params"
            (is (=? {:parameters [{:id "id", :sourceType "ask-user"}
                                  {:id "name", :sourceType "ask-user"}
                                  {:id "status", :sourceType "ask-user"}]}
                    (mt/user-http-request :crowberto :post 200
                                          "action/v2/config-form" {:action_id "dashcard:unknown:default"
                                                                   :scope     {:dashcard-id (:id dashcard)}}))))

          (testing "saved configurations includes any new parameter if exists"
            (is (=? {:parameters [{:id "id", :sourceType "ask-user"}
                                  {:id "status", :sourceType "ask-user"}
                                  ;; name is added even though it's not originally in the saved parameterMappings
                                  {:id "name", :sourceType "ask-user"}]}
                    (mt/user-http-request :crowberto :post 200
                                          "action/v2/config-form" {:action_id "dashcard:unknown:configured"
                                                                   :scope     {:dashcard-id (:id dashcard)}})))))))))

;; This covers a more exotic case where we're coming back to edit the config for an action before it has been saved.
;; This should cover both the cases where it has never been saved, or where it's simply been edited at least once since
;; it was last saved.
(deftest configure-pending-table-action-test
  (mt/with-premium-features #{:table-data-editing}
    (mt/test-drivers #{:h2 :postgres}
      (data-editing.tu/with-test-tables! [test-table [{:id        'auto-inc-type
                                                       :text      [:text]
                                                       :int       [:int]
                                                       :timestamp [:timestamp]}
                                                      {:primary-key [:id]}]]
        (testing "custom data-grid calling a table action, with pending configuration changes"
          (let [{action-id "table.row/update"} (->> (mt/user-http-request-full-response
                                                     :crowberto
                                                     :get
                                                     "action/v2/tmp-action")
                                                    :body :actions
                                                    (filter #(= test-table (:table_id %)))
                                                    (u/index-by :kind :id))
                pending-config {:parameters
                                [{:id "id",        :sourceType "row-data"}
                                 {:id "int",       :sourceType "constant", :value 42}
                                 {:id "text",      :sourceType "row-data", :visibility "readonly"}
                                 {:id "timestamp", :visibility "hidden"}]}

                scope          {:table-id test-table}]
            (is (=? {:title      "Custom Row Action 489"
                     :parameters (:parameters pending-config)}
                    (mt/user-http-request :crowberto :post 200 "action/v2/config-form"
                                          {:scope     scope
                                           :action_id {:action-id action-id
                                                       :name      "Custom Row Action 489"
                                                       :parameters (:parameters pending-config)}})))))))))

(deftest configure-pending-saved-implicit-action-test
  (mt/with-premium-features #{:table-data-editing}
    (mt/test-drivers #{:h2 :postgres}
      (data-editing.tu/with-data-editing-enabled! true
        (testing "saved actions"
          (let [mapped-pk-params    [{:id "id"         :sourceType "row-data"}]
                pending-row-params  [{:id "user_id"    :sourceType "row-data"}
                                     {:id "product_id" :sourceType "ask-user"}
                                     {:id "subtotal"   :sourceType "constant" :value 10}
                                     {:id "tax"        :sourceType "constant" :value 0}
                                     {:id "total"      :sourceType "constant" :value 0}
                                     {:id "discount"   :sourceType "constant" :value 10}
                                     {:id "created_at" :sourceType "ask-user"}
                                     {:id "quantity"   :sourceType "constant" :value 1}]
                action-kind->params {"row/create" pending-row-params
                                     "row/update" (concat mapped-pk-params pending-row-params)
                                     "row/delete" mapped-pk-params}]

            (doseq [[action-kind expected-params] action-kind->params]
              (mt/with-actions [model {:type :model, :dataset_query (mt/mbql-query orders)}
                                {action-id :action-id} {:type :implicit, :kind action-kind, :name "Implicit Action"}]
                (is (= {:title      "My Row Action"
                        :parameters expected-params}
                       (mt/user-http-request :crowberto :post 200 "action/v2/config-form"
                                             {:scope     {:model-id (:id model)
                                                          :table-id (mt/id :orders)}
                                              :action_id {:action-id action-id
                                                          :name      "My Row Action"
                                                          :parameters expected-params}})))))))))))

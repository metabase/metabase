(ns metabase-enterprise.data-editing.action-v2-api-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-editing.test-util :as data-editing.tu]
   [metabase.test :as mt]
   [metabase.util :as u]))

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
              "action/v2/configure"
              (select-keys % [:action_id
                              :scope
                              :input]))]
    (mt/with-premium-features #{:table-data-editing}
      (mt/test-drivers #{:h2 :postgres}
        (data-editing.tu/toggle-data-editing-enabled! true)
        (testing "saved actions"
          (mt/with-non-admin-groups-no-root-collection-perms
            (mt/with-temp [:model/Table table {}
                           :model/Card model {:type     :model
                                              :table_id (:id table)}
                           :model/Action action {:type       :query
                                                 :name       "Do cool thing"
                                                 :model_id   (:id model)
                                                 :parameters [{:id   "param-a"
                                                               :name "A"
                                                               :type "number/="
                                                               :slug "a"}
                                                              {:id   "param-b"
                                                               :name "B"
                                                               :type "date/single"
                                                               :slug "b"}
                                                              {:id   "param-c"
                                                               :name "C"
                                                               :type "string/="
                                                               :slug "c"}
                                                              {:id   "param-d"
                                                               :name "D"
                                                               :type "string/="
                                                               :slug "d"}
                                                              {:id   "param-e"
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
                                ;;      and also... as part of introducing /configure we are free to *change* how config is saved
                                ;;      because it will now be encapsulated. we just need migrate on read to avoid breaking
                                ;;      staging and beta users.
                                ;;      for now it doesn't tell you the type or the possible values, BUT maybe we want the wrapping
                                ;;      component to know that (it just doesn't get saved)
                                :parameters [{:id "param-a", :sourceType "ask-user", :sourceTypeTarget "a"}
                                             {:id "param-b", :sourceType "ask-user", :sourceTypeTarget "b"}
                                             {:id "param-c", :sourceType "ask-user", :sourceTypeTarget "c"}
                                             {:id "param-d", :sourceType "ask-user", :sourceTypeTarget "d"}
                                             {:id "param-e", :sourceType "ask-user", :sourceTypeTarget "e"}]}}
                      (req {:scope     {:model-id (:id model)
                                        :table-id (:id table)}
                            :action_id (:id action)}))))))))))

(deftest configure-saved-implicit-action-test
  (mt/with-premium-features #{:table-data-editing}
    (mt/test-drivers #{:h2 :postgres}
      (data-editing.tu/toggle-data-editing-enabled! true)
      (testing "saved actions"
        (let [expected-id-params  [{:id "id"         :sourceType "ask-user" :sourceTypeTarget "id"}]
              expected-row-params [{:id "user_id"    :sourceType "ask-user" :sourceTypeTarget "user_id"}
                                   {:id "product_id" :sourceType "ask-user" :sourceTypeTarget "product_id"}
                                   {:id "subtotal"   :sourceType "ask-user" :sourceTypeTarget "subtotal"}
                                   {:id "tax"        :sourceType "ask-user" :sourceTypeTarget "tax"}
                                   {:id "total"      :sourceType "ask-user" :sourceTypeTarget "total"}
                                   {:id "discount"   :sourceType "ask-user" :sourceTypeTarget "discount"}
                                   {:id "created_at" :sourceType "ask-user" :sourceTypeTarget "created_at"}
                                   {:id "quantity"   :sourceType "ask-user" :sourceTypeTarget "quantity"}]
              action-kind->expecetd-params {"row/create" expected-row-params
                                            "row/update" (concat expected-id-params expected-row-params)
                                            "row/delete"  expected-id-params}]

          (doseq [[action-kind expected-params] action-kind->expecetd-params]
            (mt/with-actions [model {:type          :model
                                     :dataset_query (mt/mbql-query orders)}
                              {action-id :action-id} {:type :implicit
                                                      :kind action-kind
                                                      :name "Do cool thing"}]
              (is (= {:title      "Do cool thing"
                      :parameters expected-params}
                     (mt/user-http-request :crowberto :post 200 "action/v2/configure"
                                           {:scope     {:model-id (:id model)
                                                        :table-id (mt/id :orders)}
                                            :action_id action-id}))))))))))

;; For example, when picking a table action to add as a row action, we call this for the initial config form.
(deftest configure-table-action-test
  (mt/with-premium-features #{:table-data-editing}
    (mt/test-drivers #{:h2 :postgres}
      (data-editing.tu/toggle-data-editing-enabled! true)
      (with-open [test-table (data-editing.tu/open-test-table! {:id        'auto-inc-type
                                                                :text      [:text]
                                                                :int       [:int]
                                                                :timestamp [:timestamp]
                                                                :date      [:date]}
                                                               {:primary-key [:id]})]

        (let [;; TODO the form for configuring a row action will need to know that ID is meant to be "locked" to
              ;;      the pk of the table underlying the data-grid.
              expected-id-params   [{:id "field-id"        :sourceType "ask-user" :sourceTypeTarget "id"}]
              expected-row-params  [{:id "field-text"      :sourceType "ask-user" :sourceTypeTarget "text"}
                                    {:id "field-int"       :sourceType "ask-user" :sourceTypeTarget "int"}
                                    {:id "field-timestamp" :sourceType "ask-user" :sourceTypeTarget "timestamp"}
                                    {:id "field-date"      :sourceType "ask-user" :sourceTypeTarget "date"}]]

          (testing "table actions"
            (let [{create-id "table.row/create"
                   update-id "table.row/update"
                   delete-id "table.row/delete"} (->> (mt/user-http-request-full-response
                                                       :crowberto
                                                       :get
                                                       "action/v2/tmp-action")
                                                      :body :actions
                                                      (filter #(= @test-table (:table_id %)))
                                                      (u/index-by :kind :id))]
              (let [scope {:table-id @test-table}]
                (testing "create"
                  (is (=? {:title      (mt/malli=? :string)
                           :parameters expected-row-params}
                          (mt/user-http-request :crowberto :post 200 "action/v2/configure"
                                                {:scope     scope
                                                 :action_id create-id}))))
                (testing "update"
                  (is (=? {:title      (mt/malli=? :string)
                           :parameters (concat expected-id-params expected-row-params)}
                          (mt/user-http-request :crowberto :post 200 "action/v2/configure"
                                                {:scope     scope
                                                 :action_id update-id}))))
                (testing "delete"
                  (is (=? {:title      (mt/malli=? :string)
                           :parameters expected-id-params}
                          (mt/user-http-request :crowberto :post 200 "action/v2/configure"
                                                {:scope     scope
                                                 :action_id delete-id}))))))))))))

;; This is the case where we are EDITING some kind of header or row action, for example.
;;
;; There are actually two different cases here:
;; 1. built-in actions (don't have their own configuration, but inherit parameter order from the Editable settings)
;; 2. custom actions (have their own configuration, but no inheritance (for now, Katya working on prod doc))
;;
;; Since we don't support configuration for (1) yet, this is only concerned with (2)
#_(deftest configure-table-action-on-editable-on-dashboard-test
    (let [req #(mt/user-http-request-full-response
                (:user % :crowberto)
                :post
                "action/v2/configure"
                (select-keys % [:action_id
                                :scope
                                :input]))]
      (mt/with-premium-features #{:table-data-editing}
        (mt/test-drivers #{:h2 :postgres}
          (data-editing.tu/toggle-data-editing-enabled! true)
          (with-open [test-table (data-editing.tu/open-test-table! {:id        'auto-inc-type
                                                                    :text      [:text]
                                                                    :int       [:int]
                                                                    :timestamp [:timestamp]
                                                                    :date      [:date]}
                                                                   {:primary-key [:id]})]

            (mt/with-temp
              [:model/Dashboard dashboard {}
               :model/DashboardCard dashcard {:dashboard_id (:id dashboard)
                                              :visualization_settings
                                              {:table_id @test-table

                                               :table.columns
                                               [{:name "int", :enabled true}
                                                {:name "text", :enabled true}
                                                {:name "timetamp", :enabled true}
                                                ;; this signals date should not be shown in the grid
                                                {:name "date", :enabled false}]

                                               :editableTable.columns
                                               ["int"
                                                ;; this signals text is not editable
                                                #_"text"
                                                "timestamp"
                                                "date"]

                                               :editableTable.enabledActions
                                               ;; We can fix this "unknown" when we move the action out of the dashcard json
                                               ;; See [[metabase.dashboards.api/create-or-fix-action-id]]
                                               [{:id                "dashcard:unknown:1"
                                                 :actionId          "table.row/create"
                                                 :parameterMappings [;; because this is a CUSTOM actions
                                                                     ;; it might not even be editing the same table,
                                                                     ;; so we need to map the primary, unlike for
                                                                     ;; built-in actions which assume its pk->pk
                                                                     {:parameter "id"
                                                                      :sourceType "row-data"
                                                                      :value      "TODO"}

                                                                     {:parameterId "int"
                                                                      :sourceType  "const"
                                                                      :value       42}
                                                                     {:parameterId       "text"
                                                                      :sourceType        "row-data"
                                                                      :sourceValueTarget "text"
                                                                      :visibility        "readonly"}
                                                                     {:parameterId "timestamp"
                                                                      :visibility  "hidden"}]}]}}]

              ;; insert a row for the row action
              (mt/user-http-request :crowberto :post 200
                                    (data-editing.tu/table-url @test-table)
                                    {:rows [{:text "a very important string"}]})

              (testing "table actions on a dashcard"
                (let [create-id "table.row/create"
                      update-id "table.row/update"
                      delete-id "table.row/delete"
                      ;; Note, we're relying on this scope to fill in "unknown" on the action id
                      ;; But in either case, we're always meant to send this for undo/redo scope anyway.
                      scope     {:dashcard-id (:id dashcard)}

                      ;; TODO build-in actions won't let you configure this
                      expected-id-params []
                      ;; params are reordered by editable (?)
                      expected-row-params [{:id "int",  :readonly false}
                                           {:id "text", :readonly true, :value "a very important string"}
                                           ;; date is hidden from the editable
                                           #_{:id "date"}
                                           ;; timestamp is hidden in the row action
                                           #_{:id "timestamp"}]]

                  (testing "without a table-id"
                    (let [scope {:dashboard-id (:dashboard_id dashcard)}]
                      (doseq [action-id [create-id update-id delete-id]]
                        (testing action-id
                          (is (=? {:status 400}
                                  (req {:action_id action-id :scope scope})))))))

                  (testing "create"
                    (is (=? {:status 200
                             :body   {:parameters []}}
                            (req {:scope     scope
                                  :action_id create-id
                                  :input     {:id 1}}))))

                  (testing "update"
                    (is (=? {:status 200} (req {:scope scope, :action_id update-id}))))

                  (testing "delete"
                    (is (=? {:status 200} (req {:scope scope, :action_id delete-id}))))))))))))

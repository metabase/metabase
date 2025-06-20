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
;; 3. Consolidate test cases between /configure, /tmp-model, and /execute

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
        (data-editing.tu/with-data-editing-enabled! true
          (testing "saved actions"
            (mt/with-non-admin-groups-no-root-collection-perms
              (mt/with-temp [:model/Table table {}
                             :model/Card model {:type     :model
                                                :table_id (:id table)}
                             :model/Action action {:type       :query
                                                   :name       "Do cool thing"
                                                   :model_id   (:id model)
                                                   :parameters [{:id   "a"
                                                                 :name "A"
                                                                 :type "number/="
                                                                 :slug "a"}
                                                                {:id   "b"
                                                                 :name "B"
                                                                 :type "date/single"
                                                                 :slug "b"}
                                                                {:id   "c"
                                                                 :name "C"
                                                                 :type "string/="
                                                                 :slug "c"}
                                                                {:id   "d"
                                                                 :name "D"
                                                                 :type "string/="
                                                                 :slug "d"}
                                                                {:id   "e"
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
                       (mt/user-http-request :crowberto :post 200 "action/v2/configure"
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
                      "action/v2/configure"
                      (select-keys % [:action_id
                                      :scope
                                      :input]))
                     :headers)]
    (mt/with-premium-features #{:table-data-editing}
      (mt/test-drivers #{:h2 :postgres}
        (data-editing.tu/with-test-tables! [test-table [{:id        'auto-inc-type
                                                         :text      [:text]
                                                         :int       [:int]
                                                         :timestamp [:timestamp]
                                                         :date      [:date]}
                                                        {:primary-key [:id]}]]

          (mt/with-temp
            [:model/Dashboard dashboard {}
             :model/DashboardCard dashcard {:dashboard_id (:id dashboard)
                                            :visualization_settings
                                            {:table_id test-table

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
                                               :actionId          "table.row/update"
                                               :actionType        "data-grid/row-action"
                                               :enabled           true
                                               ;; TODO make sure this stuff makes sense.
                                               ;;      What does the FE really write? Have we messed anything up?
                                               ;;      Have we missed any cases?
                                               :parameterMappings [{:parameterId       "id"
                                                                    :sourceType       "ask-user"}
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
                                  (data-editing.tu/table-url test-table)
                                  {:rows [{:text "a very important string"}]})

            (testing "default table action on a data-grid"
              (is (=? {:status 400}
                      (req {:action_id "dashcard:unknown:built-in-update"
                            :scope     {:dashcard-id (:id dashcard)}
                            :input     {:id 1}
                            :params    {:text "kcab em txet"}}))))

            (testing "custom table action on a data-grid"
              (is (=? {:status 200
                       :body   {:parameters
                                [{:id "id",   :sourceType "ask-user"}
                                 {:id "int",  :sourceType "constant", :value 42}
                                 {:id "text", :sourceType "row-data", :visibility "readonly"}
                                 ;; TODO https://linear.app/metabase/issue/WRK-476/handle-actions-whose-mapping-doesnt-cover-new-inputs
                                 #_{:id "date", :visibility "hidden"}
                                 {:id "timestamp", :visibility "hidden"}]}}
                      (req {:action_id "dashcard:unknown:update"
                            :scope     {:dashcard-id (:id dashcard)}
                            :input     {:id 1}}))))))))))

;; This covers a more exotic case where we're coming back to edit the config for an action before it has been saved.
;; This should cover both the cases where it has never been saved, or where it's simply been edited at least once since
;; it was last saved.
(deftest configure-pending-table-action-test
  (mt/with-premium-features #{:table-data-editing}
    (mt/test-drivers #{:h2 :postgres}
      (data-editing.tu/with-test-tables! [test-table [{:id        'auto-inc-type
                                                       :text      [:text]
                                                       :int       [:int]
                                                       :timestamp [:timestamp]
                                                       :date      [:date]}
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
                                [{:parameterId "id",        :sourceType "row-data"}
                                 {:parameterId "int",       :sourceType "constant", :value 42}
                                 {:parameterId "text",      :sourceType "row-data", :visibility "readonly"}
                                 {:parameterId "timestamp", :visibility "hidden"}]}

                ;; This gives us the format that the in-memory action looks like in the FE.
                wrap-action    (fn [packed-id]
                                 {:packed-id packed-id
                                  :param-map (->> pending-config
                                                  :parameters
                                                  ;; TODO we won't need to do this once we change the schema for
                                                  ;;      unified-action to use a list.
                                                  (u/index-by :parameterId #(dissoc % :parameterId)))})
                scope          {:table-id test-table}]
            (is (=? {:title      (mt/malli=? :string)
                     :parameters (for [p (:parameters pending-config)]
                                   ;; What a silly difference, which we should squelch.
                                   (-> p (assoc :id (:parameterId p)) (dissoc :parameterId)))}
                    (mt/user-http-request :crowberto :post 200 "action/v2/configure"
                                          {:scope     scope
                                           :action_id (wrap-action action-id)})))))))))

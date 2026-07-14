(ns metabase.agent-api.dashboard-write-parameters-test
  "The filter half of `dashboard_write`: the parameter ops, and the wiring ops.

   The property this file asserts hardest is that a filter *reaches the cards*. A dashboard whose filter is wired to
   nothing looks right in every response — the widget is there, the dashboard saved, the tool said 200 — and does
   nothing at all when a person moves it. So the tests read the mappings back off the dashcards rather than trusting
   the write's own answer, and `autowire` is asserted card by card: the ones that have the column, and the one that
   does not."
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(defn- write!
  ([body] (write! :crowberto 200 body))
  ([user status body]
   (mt/user-http-request user :post status "agent/v2/dashboard-write" body)))

(defn- refusal
  [response]
  (if (string? response) response (str (:message response))))

(defn- saved-parameters [dashboard-id]
  (t2/select-one-fn :parameters :model/Dashboard :id dashboard-id))

(defn- mappings
  "The dashcards of the dashboard that `parameter-id` reaches, and the field each mapping names — the wiring as the app
   will read it, not as the write reported it."
  [dashboard-id parameter-id]
  (into {}
        (for [{:keys [id card_id parameter_mappings]} (t2/select :model/DashboardCard :dashboard_id dashboard-id)
              {:keys [parameter_id target]}           parameter_mappings
              :when                                   (= parameter-id parameter_id)]
          [id {:card_id card_id :target target}])))

(defn- parameter-id
  "The id the save minted for the filter named `parameter-name`."
  [response parameter-name]
  (some #(when (= parameter-name (:name %)) (:id %)) (:parameters response)))

(defn- dashcard-ids
  "The dashcards a write's response says the filter reaches. The response has to agree with the dashboard, and every
   test that asserts one asserts the other."
  [response parameter-name]
  (some #(when (= parameter-name (:name %)) (set (:dashcard_ids %))) (:parameters response)))

;;; ──────────────────────────────────────────────────────────────────
;;; add_parameter
;;; ──────────────────────────────────────────────────────────────────

(deftest adds-a-filter-test
  (testing "a filter is a widget on the dashboard, and the response names it so the next op can wire it"
    (mt/with-temp [:model/Dashboard {dash-id :id} {}]
      (let [response (write! {:method "update" :id dash-id
                              :ops    [{:op "add_parameter" :name "Created at" :type "date/all-options"}]})
            saved    (first (saved-parameters dash-id))]
        (is (= "Created at" (:name saved)))
        (is (= :date/all-options (:type saved)))
        (testing "with the slug the app addresses it by in a URL"
          (is (= "created_at" (:slug saved))))
        (is (= [{:id (:id saved) :name "Created at" :type "date/all-options" :dashcard_ids []}]
               (:parameters response)))))))

(deftest adds-a-filter-with-its-settings-test
  (mt/with-temp [:model/Dashboard {dash-id :id} {}]
    (write! {:method "update" :id dash-id
             :ops    [{:op "add_parameter" :name "Category" :type "string/="
                       :default ["Gadget"] :required true :isMultiSelect false
                       :values_query_type "list" :values_source_type "static-list"
                       :values_source_config {:values ["Gadget" "Widget"]}}]})
    (let [saved (first (saved-parameters dash-id))]
      (is (= {:default              ["Gadget"]
              :required             true
              :isMultiSelect        false
              :values_query_type    :list
              :values_source_type   :static-list
              :values_source_config {:values ["Gadget" "Widget"]}}
             (select-keys saved [:default :required :isMultiSelect :values_query_type :values_source_type
                                 :values_source_config]))))))

(deftest a-filter-needs-a-name-of-its-own-test
  (testing "two filters with one name are two filters neither a reader nor a later op can tell apart"
    (mt/with-temp [:model/Dashboard {dash-id :id} {:parameters [{:id "abc123" :name "Date" :slug "date"
                                                                 :type "date/all-options"}]}]
      (is (= (str "Op 0: This dashboard already has a filter named \"Date\" (id \"abc123\"). Wire that one instead, "
                  "or give this one a name of its own. Nothing was written — fix that op and send the whole list "
                  "again.")
             (refusal (write! :crowberto 400 {:method "update" :id dash-id
                                              :ops    [{:op "add_parameter" :name "Date" :type "date/all-options"}]}))))
      (is (= 1 (count (saved-parameters dash-id)))))))

(deftest a-filter-type-is-one-the-app-has-test
  (testing "the type is an enum of the app's own filter types, and a type nobody has is refused before anything runs"
    (mt/with-temp [:model/Dashboard {dash-id :id} {}]
      (write! :crowberto 400 {:method "update" :id dash-id
                              :ops    [{:op "add_parameter" :name "Date" :type "date/whenever"}]})
      (is (= [] (saved-parameters dash-id))))))

(deftest a-required-filter-brings-a-default-test
  (testing "`required` means the dashboard cannot be read without a value, so it has to bring one"
    (mt/with-temp [:model/Dashboard {dash-id :id} {}]
      (is (= (str "Op 0: A required filter needs a `default`: `required: true` means the dashboard cannot be read "
                  "without a value for it, so it has to bring one. Nothing was written — fix that op and send the "
                  "whole list again.")
             (refusal (write! :crowberto 400
                              {:method "update" :id dash-id
                               :ops    [{:op "add_parameter" :name "Date" :type "date/all-options"
                                         :required true}]}))))
      (is (= [] (saved-parameters dash-id))))))

;;; ──────────────────────────────────────────────────────────────────
;;; wire_parameter, and the auto-wire
;;; ──────────────────────────────────────────────────────────────────

(defn- with-a-dashboard!
  "A dashboard with two cards over ORDERS and one over PRODUCTS, and the ids of the three dashcards."
  [f]
  (mt/with-temp [:model/Card      {orders-id :id}   {:name "Orders" :dataset_query (mt/mbql-query orders)}
                 :model/Card      {revenue-id :id}  {:name "Revenue"
                                                     :dataset_query (mt/mbql-query orders
                                                                      {:aggregation [[:sum $total]]})}
                 :model/Card      {products-id :id} {:name "Products" :dataset_query (mt/mbql-query products)}
                 :model/Dashboard {dash-id :id}     {}]
    (let [response (write! {:method "update" :id dash-id
                            :ops    [{:op "add_card" :card_id orders-id}
                                     {:op "add_card" :card_id revenue-id}
                                     {:op "add_card" :card_id products-id}]})
          [orders revenue products] (map :id (:dashcards response))]
      (f {:dashboard-id dash-id
          :orders       orders
          :revenue      revenue
          :products     products}))))

(deftest wires-a-filter-to-a-column-test
  (testing "a filter is wired to one column of one card, named the way a person names it"
    (with-a-dashboard!
      (fn [{:keys [dashboard-id orders]}]
        (let [response (write! {:method "update" :id dashboard-id
                                :ops    [{:op "add_parameter" :name "Created at" :type "date/all-options"}
                                         {:op "wire_parameter" :parameter_id "Created at" :dashcard_id orders
                                          :target_field "CREATED_AT"}]})
              param-id (parameter-id response "Created at")
              wired    (mappings dashboard-id param-id)]
          (is (= #{orders} (set (keys wired))))
          (is (= [:dimension [:field (mt/id :orders :created_at) {:base-type :type/DateTimeWithLocalTZ}]
                  {:stage-number 0}]
                 (:target (wired orders))))
          (testing "and the response says which cards the filter reaches, without a read"
            (is (= #{orders} (dashcard-ids response "Created at")))))))))

(deftest autowire-reaches-every-card-with-the-column-test
  (testing "`autowire` is what makes one filter narrow the whole dashboard: every card on the tab that has the column
            is wired to it, and the card that does not have it is left alone"
    (with-a-dashboard!
      (fn [{:keys [dashboard-id orders revenue]}]
        (let [response (write! {:method "update" :id dashboard-id
                                :ops    [{:op "add_parameter" :name "Created at" :type "date/all-options"}
                                         {:op "wire_parameter" :parameter_id "Created at" :dashcard_id orders
                                          :target_field "CREATED_AT" :autowire true}]})
              param-id (parameter-id response "Created at")
              wired    (mappings dashboard-id param-id)]
          (is (= #{orders revenue} (set (keys wired)))
              "the two cards built on ORDERS are wired; the one built on PRODUCTS has no ORDERS.CREATED_AT")
          (testing "and each is wired to its own query's column, not to a copy of the first card's ref"
            (is (= [:dimension [:field (mt/id :orders :created_at) {:base-type :type/DateTimeWithLocalTZ}]
                    {:stage-number 0}]
                   (:target (wired revenue)))))
          (is (= #{orders revenue} (dashcard-ids response "Created at"))))))))

(deftest builds-a-whole-dashboard-with-its-filters-in-one-call-test
  (testing "the ops that wire name the filter by its name and the card by its card id, because the dashboard's own
            ids — the filter's, the dashcards' — are minted by the save this very call compiles into"
    (mt/with-temp [:model/Card {orders-id :id}   {:name "Orders" :dataset_query (mt/mbql-query orders)}
                   :model/Card {products-id :id} {:name "Products" :dataset_query (mt/mbql-query products)}]
      (mt/with-model-cleanup [:model/Dashboard]
        (let [response (write! {:method "create" :name "Sales"
                                :ops    [{:op "add_card" :card_id orders-id}
                                         {:op "add_card" :card_id products-id}
                                         {:op "add_parameter" :name "Created at" :type "date/all-options"}
                                         {:op "wire_parameter" :parameter_id "Created at" :card_id orders-id
                                          :target_field "CREATED_AT" :autowire true}]})
              param-id (parameter-id response "Created at")
              orders   (:id (first (filter #(= orders-id (:card_id %)) (:dashcards response))))]
          (is (= #{orders} (set (keys (mappings (:id response) param-id))))))))))

(deftest autowire-leaves-a-card-that-is-already-wired-alone-test
  (testing "auto-wire fills in the cards nobody has wired; a card wired to another column of its own keeps it"
    (with-a-dashboard!
      (fn [{:keys [dashboard-id orders revenue]}]
        (let [response (write! {:method "update" :id dashboard-id
                                :ops    [{:op "add_parameter" :name "Created at" :type "date/all-options"}
                                         {:op "wire_parameter" :parameter_id "Created at" :dashcard_id revenue
                                          :target_field (mt/id :orders :created_at)}
                                         {:op "wire_parameter" :parameter_id "Created at" :dashcard_id orders
                                          :target_field "CREATED_AT" :autowire true}]})
              param-id (parameter-id response "Created at")]
          (is (= #{orders revenue} (set (keys (mappings dashboard-id param-id))))))))))

(deftest a-filter-that-sits-on-a-card-does-not-spread-test
  (testing "a filter moved onto a card is a filter about that card, and auto-wire leaves the rest of them alone"
    (with-a-dashboard!
      (fn [{:keys [dashboard-id orders revenue]}]
        (let [response (write! {:method "update" :id dashboard-id
                                :ops    [{:op "add_parameter" :name "Created at" :type "date/all-options"}
                                         {:op "move_parameter" :parameter_id "Created at" :dashcard_id orders}
                                         {:op "wire_parameter" :parameter_id "Created at" :dashcard_id orders
                                          :target_field "CREATED_AT" :autowire true}]})
              param-id (parameter-id response "Created at")]
          (is (= #{orders} (set (keys (mappings dashboard-id param-id)))))
          (is (not (contains? (set (keys (mappings dashboard-id param-id))) revenue))))))))

(deftest a-filter-reaches-what-its-type-can-narrow-test
  (testing "the type is what a filter can reach: a number filter cannot narrow a date column, and the refusal says
            what the card *can* be filtered by"
    (with-a-dashboard!
      (fn [{:keys [dashboard-id orders]}]
        (let [message (refusal (write! :crowberto 400
                                       {:method "update" :id dashboard-id
                                        :ops    [{:op "add_parameter" :name "Total" :type "number/between"}
                                                 {:op "wire_parameter" :parameter_id "Total" :dashcard_id orders
                                                  :target_field "CREATED_AT"}]}))]
          (is (re-find #"has nothing called \"CREATED_AT\" that this filter can narrow" message))
          (is (re-find #"It can filter: .*\"Total\"" message))
          (testing "and nothing was written — not even the filter the first op added"
            (is (= [] (saved-parameters dashboard-id)))))))))

(deftest wires-a-filter-to-a-sql-variable-test
  (testing "a native card is filtered through the `{{tags}}` its SQL declares, not through its columns"
    (mt/with-temp [:model/Card {card-id :id}
                   {:name          "Orders by status"
                    :dataset_query (mt/native-query
                                    {:query         "SELECT * FROM orders WHERE status = {{status}}"
                                     :template-tags {"status" {:id           "tag-id"
                                                               :name         "status"
                                                               :display-name "Status"
                                                               :type         :text}}})}
                   :model/Dashboard {dash-id :id} {}]
      (let [response (write! {:method "update" :id dash-id
                              :ops    [{:op "add_card" :card_id card-id}
                                       {:op "add_parameter" :name "Status" :type "string/="}]})
            dashcard (:id (first (:dashcards response)))
            response (write! {:method "update" :id dash-id
                              :ops    [{:op "wire_parameter" :parameter_id "Status" :dashcard_id dashcard
                                        :target_tag "status"}]})
            param-id (parameter-id response "Status")]
        (is (= [:variable [:template-tag "status"]]
               (:target (get (mappings dash-id param-id) dashcard))))
        (testing "and a tag the SQL does not declare is refused with the ones it does"
          (is (re-find #"has no `\{\{nope\}\}` this filter can fill in"
                       (refusal (write! :crowberto 400
                                        {:method "update" :id dash-id
                                         :ops    [{:op "wire_parameter" :parameter_id "Status"
                                                   :dashcard_id dashcard :target_tag "nope"}]})))))))))

(deftest wires-a-filter-to-a-text-card-tag-test
  (testing "a text card takes a filter's value where its `{{tag}}` stands, so the prose reads back what was picked"
    (mt/with-temp [:model/Dashboard {dash-id :id} {}]
      (let [response (write! {:method "update" :id dash-id
                              :ops    [{:op "add_text" :markdown "Showing {{status}} orders"}
                                       {:op "add_parameter" :name "Status" :type "string/="}]})
            dashcard (:id (first (:dashcards response)))
            response (write! {:method "update" :id dash-id
                              :ops    [{:op "wire_parameter" :parameter_id "Status" :dashcard_id dashcard
                                        :target_tag "status"}]})
            param-id (parameter-id response "Status")]
        (is (= [:text-tag "status"] (:target (get (mappings dash-id param-id) dashcard))))
        (testing "and the wiring goes when the tag goes: a mapping to text that is no longer there points at nothing"
          (write! {:method "update" :id dash-id
                   :ops    [{:op "patch_dashcard" :dashcard_id dashcard :patch {:text "Showing all orders"}}]})
          (is (= {} (mappings dash-id param-id))))))))

(deftest unwires-one-card-and-all-of-them-test
  (with-a-dashboard!
    (fn [{:keys [dashboard-id orders revenue]}]
      (let [response (write! {:method "update" :id dashboard-id
                              :ops    [{:op "add_parameter" :name "Created at" :type "date/all-options"}
                                       {:op "wire_parameter" :parameter_id "Created at" :dashcard_id orders
                                        :target_field "CREATED_AT" :autowire true}]})
            param-id (parameter-id response "Created at")]
        (testing "a `dashcard_id` unwires that card"
          (write! {:method "update" :id dashboard-id
                   :ops    [{:op "unwire_parameter" :parameter_id param-id :dashcard_id orders}]})
          (is (= #{revenue} (set (keys (mappings dashboard-id param-id))))))
        (testing "and no `dashcard_id` unwires every card, leaving the filter itself in place"
          (let [response (write! {:method "update" :id dashboard-id
                                  :ops    [{:op "unwire_parameter" :parameter_id param-id}]})]
            (is (= {} (mappings dashboard-id param-id)))
            (is (= 1 (count (:parameters response))))))))))

;;; ──────────────────────────────────────────────────────────────────
;;; update_parameter
;;; ──────────────────────────────────────────────────────────────────

(deftest updates-a-filter-test
  (mt/with-temp [:model/Dashboard {dash-id :id} {:parameters [{:id "abc123" :name "Date" :slug "date"
                                                               :type "date/all-options"}]}]
    (write! {:method "update" :id dash-id
             :ops    [{:op "update_parameter" :parameter_id "abc123" :name "Order date"
                       :default "past30days" :values_query_type "none"}]})
    (let [saved (first (saved-parameters dash-id))]
      (is (= "Order date" (:name saved)))
      (testing "renaming re-slugs it, because the slug is the name a URL uses"
        (is (= "order_date" (:slug saved))))
      (is (= "past30days" (:default saved)))
      (is (= :none (:values_query_type saved))))))

(deftest a-retyped-filter-loses-what-the-old-type-meant-test
  (testing "a date filter made a number filter keeps neither its default nor the date column it was wired to: both
            belonged to the type it no longer has"
    (with-a-dashboard!
      (fn [{:keys [dashboard-id orders]}]
        (let [response (write! {:method "update" :id dashboard-id
                                :ops    [{:op "add_parameter" :name "Created at" :type "date/all-options"
                                          :default "past30days"}
                                         {:op "wire_parameter" :parameter_id "Created at" :dashcard_id orders
                                          :target_field "CREATED_AT" :autowire true}]})
              param-id (parameter-id response "Created at")]
          (is (seq (mappings dashboard-id param-id)))
          (write! {:method "update" :id dashboard-id
                   :ops    [{:op "update_parameter" :parameter_id param-id :type "number/between"}]})
          (let [saved (first (saved-parameters dashboard-id))]
            (is (= :number/between (:type saved)))
            (is (nil? (:default saved)))
            (is (= {} (mappings dashboard-id param-id))
                "the wiring to a date column is wiring a number filter cannot carry")))))))

(deftest checks-the-fields-the-dashboard-schema-does-not-test
  (testing "`required` and `isMultiSelect` are not fields the dashboard's own schema declares, so a value it would
            store unread is refused here or nowhere"
    (mt/with-temp [:model/Dashboard {dash-id :id} {}]
      (write! :crowberto 400 {:method "update" :id dash-id
                              :ops    [{:op "add_parameter" :name "Date" :type "date/all-options"
                                        :isMultiSelect "yes"}]})
      (is (= [] (saved-parameters dash-id))))))

(deftest checks-the-time-units-of-a-temporal-unit-filter-test
  (mt/with-temp [:model/Dashboard {dash-id :id} {}]
    (is (re-find #"\"fortnight\" is not a time unit"
                 (refusal (write! :crowberto 400
                                  {:method "update" :id dash-id
                                   :ops    [{:op "add_parameter" :name "Group by" :type "temporal-unit"
                                             :temporal_units ["month" "fortnight"]}]}))))))

;;; ──────────────────────────────────────────────────────────────────
;;; move_parameter
;;; ──────────────────────────────────────────────────────────────────

(deftest moves-a-filter-in-the-header-test
  (testing "a filter's place in the list is its place in the row of filters at the top of the dashboard"
    (mt/with-temp [:model/Dashboard {dash-id :id} {}]
      (write! {:method "update" :id dash-id
               :ops    [{:op "add_parameter" :name "One" :type "string/="}
                        {:op "add_parameter" :name "Two" :type "string/="}
                        {:op "add_parameter" :name "Three" :type "string/="}]})
      (let [response (write! {:method "update" :id dash-id
                              :ops    [{:op "move_parameter" :parameter_id "Three" :index 0}]})]
        (is (= ["Three" "One" "Two"] (mapv :name (:parameters response))))
        (is (= ["Three" "One" "Two"] (mapv :name (saved-parameters dash-id))))))))

(deftest an-index-counts-the-filters-in-the-header-test
  (testing "a filter that sits on a card is not in the row at the top of the page, so it is not one of the places an
            index counts — even though it is in the same list"
    (with-a-dashboard!
      (fn [{:keys [dashboard-id orders]}]
        (write! {:method "update" :id dashboard-id
                 :ops    [{:op "add_parameter" :name "One" :type "string/="}
                          {:op "add_parameter" :name "On the card" :type "string/="}
                          {:op "add_parameter" :name "Two" :type "string/="}
                          {:op "move_parameter" :parameter_id "On the card" :dashcard_id orders}]})
        (let [response (write! {:method "update" :id dashboard-id
                                :ops    [{:op "move_parameter" :parameter_id "Two" :index 0}]})
              inline   (:inline_parameter_ids (first (filter #(= orders (:id %)) (:dashcards response))))]
          (is (= ["Two" "One"] (mapv :name (remove #(some #{(:id %)} inline) (:parameters response))))
              "the row at the top of the page reads Two, One — the filter on the card is not a place in it")
          (is (= 1 (count inline))))))))

(deftest moves-a-filter-onto-a-card-and-back-test
  (with-a-dashboard!
    (fn [{:keys [dashboard-id orders]}]
      (let [response (write! {:method "update" :id dashboard-id
                              :ops    [{:op "add_parameter" :name "Created at" :type "date/all-options"}
                                       {:op "move_parameter" :parameter_id "Created at" :dashcard_id orders}]})
            param-id (parameter-id response "Created at")]
        (testing "a filter on a card shows on the card, and the response says which card"
          (is (= [param-id]
                 (:inline_parameter_ids (first (filter #(= orders (:id %)) (:dashcards response))))))
          (is (= [param-id]
                 (t2/select-one-fn :inline_parameters :model/DashboardCard :id orders))))
        (testing "and an `index` puts it back at the top of the page"
          (let [response (write! {:method "update" :id dashboard-id
                                  :ops    [{:op "move_parameter" :parameter_id param-id :index 0}]})]
            (is (empty? (:inline_parameter_ids (first (filter #(= orders (:id %)) (:dashcards response))))))
            (is (= [] (t2/select-one-fn :inline_parameters :model/DashboardCard :id orders)))))))))

(deftest a-filter-sits-only-where-a-filter-can-sit-test
  (mt/with-temp [:model/Dashboard {dash-id :id} {}]
    (let [response (write! {:method "update" :id dash-id
                            :ops    [{:op "add_text" :markdown "Notes"}
                                     {:op "add_parameter" :name "Date" :type "date/all-options"}]})
          text-id  (:id (first (:dashcards response)))]
      (is (re-find #"A filter can only sit on a card or on a heading"
                   (refusal (write! :crowberto 400
                                    {:method "update" :id dash-id
                                     :ops    [{:op "move_parameter" :parameter_id "Date"
                                               :dashcard_id text-id}]})))))))

;;; ──────────────────────────────────────────────────────────────────
;;; remove_parameter
;;; ──────────────────────────────────────────────────────────────────

(deftest removes-a-filter-and-every-reference-to-it-test
  (testing "a reference the removal left behind is a reference to a filter that is not there"
    (with-a-dashboard!
      (fn [{:keys [dashboard-id orders]}]
        (let [response  (write! {:method "update" :id dashboard-id
                                 :ops    [{:op "add_parameter" :name "Created at" :type "date/all-options"}
                                          {:op "add_parameter" :name "Total" :type "number/between"}
                                          {:op "wire_parameter" :parameter_id "Created at" :dashcard_id orders
                                           :target_field "CREATED_AT" :autowire true}
                                          {:op "move_parameter" :parameter_id "Created at" :dashcard_id orders}]})
              created-at (parameter-id response "Created at")
              total      (parameter-id response "Total")
              _          (write! {:method "update" :id dashboard-id
                                  :ops    [{:op "update_parameter" :parameter_id total
                                            :filteringParameters [created-at]}]})
              response   (write! {:method "update" :id dashboard-id
                                  :ops    [{:op "remove_parameter" :parameter_id created-at}]})]
          (testing "the filter is gone"
            (is (= ["Total"] (mapv :name (saved-parameters dashboard-id)))))
          (testing "so is the wiring to the cards it filtered"
            (is (= {} (mappings dashboard-id created-at))))
          (testing "so is the card it sat on"
            (is (= [] (t2/select-one-fn :inline_parameters :model/DashboardCard :id orders))))
          (testing "and so is the linked filter that narrowed the one left behind"
            (is (= [] (:filteringParameters (first (saved-parameters dashboard-id))))))
          (is (nil? (:broken_subscriptions response))))))))

(deftest names-the-subscriptions-a-removal-breaks-test
  (testing "removing a filter a subscription sends archives that subscription and mails its creator — the person who
            was getting that email is not going to work that out on their own, so the response names it"
    (mt/with-temp [:model/Dashboard {dash-id :id} {:parameters [{:id "abc123" :name "Date" :slug "date"
                                                                 :type "date/all-options"}]}
                   :model/Pulse     {pulse-id :id} {:name         "Monday numbers"
                                                    :dashboard_id dash-id
                                                    :parameters   [{:id "abc123" :name "Date" :value "past30days"}]}]
      (let [response (write! {:method "update" :id dash-id
                              :ops    [{:op "remove_parameter" :parameter_id "abc123"}]})]
        (is (= [{:id pulse-id :name "Monday numbers"}] (:broken_subscriptions response)))
        (testing "and the save archived it, as it does for the app's own editor"
          (is (true? (t2/select-one-fn :archived :model/Pulse :id pulse-id))))))))

(deftest a-dry-run-names-the-subscriptions-it-would-break-test
  (testing "which is the point of a dry run: the answer arrives before the damage does"
    (mt/with-temp [:model/Dashboard {dash-id :id} {:parameters [{:id "abc123" :name "Date" :slug "date"
                                                                 :type "date/all-options"}]}
                   :model/Pulse     {pulse-id :id} {:name         "Monday numbers"
                                                    :dashboard_id dash-id
                                                    :parameters   [{:id "abc123" :name "Date" :value "past30days"}]}]
      (let [response (write! {:method "update" :id dash-id :validate_only true
                              :ops    [{:op "remove_parameter" :parameter_id "abc123"}]})]
        (is (true? (:validated response)))
        (is (= [{:id pulse-id :name "Monday numbers"}] (:broken_subscriptions response)))
        (testing "and nothing was written"
          (is (= 1 (count (saved-parameters dash-id))))
          (is (false? (t2/select-one-fn :archived :model/Pulse :id pulse-id))))))))

;;; ──────────────────────────────────────────────────────────────────
;;; the compile is still all-or-nothing
;;; ──────────────────────────────────────────────────────────────────

(deftest a-bad-filter-op-writes-nothing-test
  (testing "the filter ops compile through the same all-or-nothing save the card ops do: an op that cannot be applied
            aborts the list, naming its index, and the cards the ops before it added are not on the dashboard either"
    (mt/with-temp [:model/Card      {card-id :id} {:dataset_query (mt/mbql-query orders)}
                   :model/Dashboard {dash-id :id} {}]
      (let [message (refusal (write! :crowberto 404
                                     {:method "update" :id dash-id
                                      :ops    [{:op "add_card" :card_id card-id}
                                               {:op "add_parameter" :name "Date" :type "date/all-options"}
                                               {:op "wire_parameter" :parameter_id "Nope" :dashcard_id 1
                                                :target_field "CREATED_AT"}]}))]
        (is (re-find #"^Op 2: This dashboard has no filter \"Nope\"" message))
        (is (= [] (t2/select :model/DashboardCard :dashboard_id dash-id)))
        (is (= [] (saved-parameters dash-id)))))))

(deftest a-dry-run-of-a-build-writes-nothing-test
  (testing "`validate_only` compiles the filters as well as the cards, so the dry run of a whole build is a dry run"
    (mt/with-temp [:model/Card      {card-id :id} {:dataset_query (mt/mbql-query orders)}
                   :model/Dashboard {dash-id :id} {}]
      (let [response (write! {:method "update" :id dash-id :validate_only true
                              :ops    [{:op "add_card" :card_id card-id}
                                       {:op "add_parameter" :name "Created at" :type "date/all-options"}]})]
        (is (true? (:validated response)))
        (is (= ["Created at"] (mapv :name (:parameters response))))
        (is (= [] (saved-parameters dash-id)))
        (is (= [] (t2/select :model/DashboardCard :dashboard_id dash-id)))))))

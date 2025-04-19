(ns metabase.load-test.core
  (:require
   [metabase.load-test.client :as lt.client]
   [metabase.load-test.system :as lt.system]
   [metabase.session.core :as session]
   [metabase.test :as mt]
   [trombi.core :as trombi]))

(set! *warn-on-reflection* true)

(defn test-login
  []
  (let [system (-> lt.system/base-system
                   (lt.system/with-app-db-seed [[:model/User :? {:email    "ngoc@metabase.com"
                                                                 :password "securedpassword"}]])
                   (lt.system/with-metabase-cluster 2 :seed/app-db))]
    (lt.system/with-system! system [_]
      (letfn [(send-ngoc-login [_]
                (let [{:keys [status]} (lt.client/client :post "session"
                                                         {:username "ngoc@metabase.com"
                                                          :password "securedpassword"})]
                  (= status 200)))
              (send-crowberto-login [_]
                (let [{:keys [status]} (lt.client/client :post "session"
                                                         {:username "crowberto@metabase.com"
                                                          :password "blackjet"})]
                  (= status 200)))]
        (trombi/run {:name "Login Simulation"
                     :scenarios [{:name "Login against a 2 instance metabase cluster with postgresql"
                                  :steps [{:name "login ngoc"
                                           :request send-ngoc-login}
                                          {:name "login crowberto"
                                           :request send-crowberto-login}]}]}
                    {:concurrency 100})))))

(comment
  (defn test-dashcard-deadlock-cache-enabled
    []
    (lt.containers/with-containers! lt.containers/config-with-postgres-two-metabase
      (lt.db/with-container-app-db :db/postgres
        (lt.db/with-db-and-dataset! :db/postgres test-data
          (let [session-key (session/generate-session-key)
                models ;; copied from the with-chained-filters-fixture can I make with-temp work in these tests?
                (add-load/from-script
                 [[:model/User {:?/user-id :id} {:email "load.test@example.com"
                                                 :password "loadtestpassword"}]
                  [:model/Session :? {:id (session/generate-session-id)
                                      :key_hashed (session/hash-session-key session-key)
                                      :user_id :?/user-id}]
                  [:model/Card          {:?/source-card-id :id}   {:dataset_query (mt/mbql-query categories {:limit 5})
                                                                   :database_id   (mt/id)
                                                                   :table_id      (mt/id :categories)}]
                  [:model/Dashboard     {:?/dashboard-id :id} {:parameters [{:name "Category Name"
                                                                             :slug "category_name"
                                                                             :id   "_CATEGORY_NAME_"
                                                                             :type "category"}
                                                                            {:name "Category ID"
                                                                             :slug "category_id"
                                                                             :id   "_CATEGORY_ID_"
                                                                             :type "category"}
                                                                            {:name "Price"
                                                                             :slug "price"
                                                                             :id   "_PRICE_"
                                                                             :type "category"}
                                                                            {:name "ID"
                                                                             :slug "id"
                                                                             :id   "_ID_"
                                                                             :type "category"}
                                                                            {:name                 "Static Category"
                                                                             :slug                 "static_category"
                                                                             :id                   "_STATIC_CATEGORY_"
                                                                             :type                 "category"
                                                                             :values_source_type   "static-list"
                                                                             :values_source_config {:values ["African" "American" "Asian"]}}
                                                                            {:name                 "Static Category label"
                                                                             :slug                 "static_category_label"
                                                                             :id                   "_STATIC_CATEGORY_LABEL_"
                                                                             :type                 "category"
                                                                             :values_source_type   "static-list"
                                                                             :values_source_config {:values [["African" "Af"] ["American" "Am"] ["Asian" "As"]]}}
                                                                            {:id                   "_CARD_"
                                                                             :type                 "category"
                                                                             :name                 "CATEGORY"
                                                                             :values_source_type   "card"
                                                                             :values_source_config {:card_id     :?/source-card-id
                                                                                                    :value_field (mt/$ids $categories.name)}}
                                                                            {:name "Not Category Name"
                                                                             :slug "not_category_name"
                                                                             :id   "_NOT_CATEGORY_NAME_"
                                                                             :type :string/!=}
                                                                            {:name    "Category Contains"
                                                                             :slug    "category_contains"
                                                                             :id      "_CATEGORY_CONTAINS_"
                                                                             :type    :string/contains
                                                                             :options {:case-sensitive false}}
                                                                            {:name "Name", :slug "name", :id "_name_", :type :string/=}
                                                                            {:name "Not Name", :slug "notname", :id "_notname_", :type :string/!=}
                                                                            {:name "Contains", :slug "contains", :id "_contains_", :type :string/contains}]}]
                  [:model/Card          {:?/card-id :id} {:database_id   (mt/id)
                                                          :table_id      (mt/id :venues)
                                                          :dataset_query (mt/mbql-query venues)}]
                  [:model/Card          {:?/card2-id :id} {:database_id   (mt/id)
                                                           :query_type    :native
                                                           :name          "test question"
                                                           :creator_id    :?/user-id
                                                           :dataset_query {:database (mt/id)
                                                                           :type     :native
                                                                           :native   {:query "SELECT COUNT(*) FROM categories WHERE {{name}} AND {{noname}}"
                                                                                      :template-tags
                                                                                      {"name"     {:name         "name"
                                                                                                   :display-name "Name"
                                                                                                   :type         :dimension
                                                                                                   :dimension    [:field (mt/id :categories :name) nil]
                                                                                                   :widget-type  :string/=}
                                                                                       "notname"  {:name         "notname"
                                                                                                   :display-name "Not Name"
                                                                                                   :type         :dimension
                                                                                                   :dimension    [:field (mt/id :categories :name) nil]
                                                                                                   :widget-type  :string/!=}
                                                                                       "contains" {:name         "contains"
                                                                                                   :display-name "Name Contains"
                                                                                                   :type         :dimension
                                                                                                   :dimension    [:field (mt/id :categories :name) nil]
                                                                                                   :widget-type  :string/contains
                                                                                                   :options      {:case-sensitive false}}}}}}]
                  [:model/DashboardCard {:?/dashcard-id :id} {:card_id            :?/card-id
                                                              :dashboard_id       :?/dashboard-id
                                                              :parameter_mappings [{:parameter_id "_CATEGORY_NAME_"
                                                                                    :card_id      :?/card-id
                                                                                    :target       [:dimension (mt/$ids venues $category_id->categories.name)]}
                                                                                   {:parameter_id "_CATEGORY_ID_"
                                                                                    :card_id      :?/card-id
                                                                                    :target       [:dimension (mt/$ids venues $category_id)]}
                                                                                   {:parameter_id "_PRICE_"
                                                                                    :card_id      :?/card-id
                                                                                    :target       [:dimension (mt/$ids venues $price)]}
                                                                                   {:parameter_id "_ID_"
                                                                                    :card_id      :?/card-id
                                                                                    :target       [:dimension (mt/$ids venues $id)]}
                                                                                   {:parameter_id "_ID_"
                                                                                    :card_id      :?/card-id
                                                                                    :target       [:dimension (mt/$ids venues $id)]}
                                                                                   {:parameter_id "_STATIC_CATEGORY_"
                                                                                    :card_id      :?/card-id
                                                                                    :target       [:dimension (mt/$ids venues $category_id->categories.name)]}
                                                                                   {:parameter_id "_STATIC_CATEGORY_LABEL_"
                                                                                    :card_id      :?/card-id
                                                                                    :target       [:dimension (mt/$ids venues $category_id->categories.name)]}
                                                                                   {:parameter_id "_NOT_CATEGORY_NAME_"
                                                                                    :card_id      :?/card-id
                                                                                    :target       [:dimension (mt/$ids venues $category_id->categories.name)]}
                                                                                   {:parameter_id "_CATEGORY_CONTAINS_"
                                                                                    :card_id      :?/card-id
                                                                                    :target       [:dimension (mt/$ids venues $category_id->categories.name)]}]}]
                  [:model/DashboardCard {:?/dashcard2-id :id} {:card_id      :?/card2-id
                                                               :dashboard_id :?/dashboard-id
                                                               :parameter_mappings
                                                               [{:parameter_id "_name_", :card_id :?/card2-id, :target [:dimension [:template-tag "name"]]}
                                                                {:parameter_id "_notname_", :card_id :?/card2-id, :target [:dimension [:template-tag "notname"]]}
                                                                {:parameter_id "_contains_", :card_id :?/card2-id, :target [:dimension [:template-tag "contains"]]}]}]])]
            (letfn [(send-card-request [dashboard-id card-id dashcard-id]
                      (fn [_]
                        (let [url (format "dashboard/%d/dashcard/%d/card/%d/query" dashboard-id dashcard-id card-id)
                              {:keys [status] :as response} (lt.client/client session-key :post url)]
                          (= status 202))))]
              (trombi/run {:name "Dashcard request simulation"
                           :scenarios [{:name "Login against a 2 instance metabase cluster with postgresql"
                                        :steps [{:name "card 1 requests"
                                                 :request (send-card-request (:dashboard-id models)
                                                                             (:card-id models)
                                                                             (:dashcard-id models))}]}]}
                          {:concurrency 100}))))))))

(comment
  (metabase.load-test.core/test-dashcard-deadlock-cache-enabled)
  (metabase.load-test.core/test-login))

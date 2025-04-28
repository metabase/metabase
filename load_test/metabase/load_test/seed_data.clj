(ns metabase.load-test.seed-data
  (:require
   [metabase.session.core :as session]
   [metabase.test :as mt]))

(defn chained-filters-seed-data
  [session-key]
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
                                           :table_id      (mt/id :orders)
                                           :dataset_query (mt/mbql-query orders)}]
   [:model/Card          {:?/card2-id :id} {:database_id   (mt/id)
                                            :query_type    :native
                                            :name          "test question"
                                            :creator_id    :?/user-id
                                            :dataset_query {:database (mt/id)
                                                            :type     :native
                                                            :native   {:query "SELECT *, upper(substr(md5(random()::text), 1, 25)) as rand1, upper(substr(md5(random()::text), 1, 25)) as rand2, upper(substr(md5(random()::text), 1, 25)) as rand3 FROM orders"}}}]
   [:model/DashboardCard {:?/dashcard-id :id} {:card_id            :?/card-id
                                               :dashboard_id       :?/dashboard-id}]
   [:model/DashboardCard {:?/dashcard2-id :id} {:card_id      :?/card2-id
                                                :dashboard_id :?/dashboard-id}]])

(defn cache-dwh
  []
  [[:model/CacheConfig :? {:invalidated_at nil
                           :config {:unit "hours"
                                    :duration 24}
                           :state nil
                           :strategy :duration
                           :model_id 0
                           :refresh_automatically false
                           :next_run_at nil
                           :model "root"}]])
